import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobType, OwnerTipe, Role, StatusEkstraksi } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { JobsService } from '../jobs/jobs.service';
import { extractFileNameFromKey } from '../storage/storage-key.util';
import { StorageService } from '../storage/storage.service';
import { CreateBuktiDukungDto } from './dto/create-bukti-dukung.dto';

/** docs/database.md §7 — PENYUSUN is scoped to their own prodi and own uploads; ADMIN has no access at all. */
const SCOPED_TO_OWN_PRODI: Role[] = [Role.PENYUSUN];

@Injectable()
export class BuktiDukungService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jobsService: JobsService,
    private readonly storage: StorageService,
  ) {}

  async create(dto: CreateBuktiDukungDto) {
    const { tenantId, userId, role, studyProgramId } =
      this.tenantContext.getOrThrow();

    // Re-checked here (not just StorageController) so no code path can create a row pointing at another tenant's object.
    if (!dto.fileKey.startsWith(`${tenantId}/`)) {
      throw new ForbiddenException('fileKey ini bukan milik tenant Anda');
    }

    if (dto.ownerType === OwnerTipe.PROGRAM_STUDI) {
      if (!dto.studyProgramId) {
        throw new BadRequestException(
          'studyProgramId wajib diisi untuk ownerType PROGRAM_STUDI',
        );
      }
      if (SCOPED_TO_OWN_PRODI.includes(role) && dto.studyProgramId !== studyProgramId) {
        throw new ForbiddenException(
          'Penyusun hanya boleh mengunggah bukti dukung untuk program studinya sendiri',
        );
      }
      const prodi = await this.prisma.studyProgram.findFirst({
        where: { id: dto.studyProgramId, tenantId },
      });
      if (!prodi) {
        throw new NotFoundException('Program studi tidak ditemukan');
      }
    } else if (dto.studyProgramId) {
      throw new BadRequestException(
        'studyProgramId harus kosong untuk ownerType TENANT',
      );
    } else if (SCOPED_TO_OWN_PRODI.includes(role)) {
      throw new ForbiddenException(
        'Penyusun tidak boleh mengunggah bukti dukung level tenant',
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // Folder tujuan (bila ada) harus berada di cakupan yang sama, dan sudah
    // ditegakkan tenant/prodi-nya sendiri lewat query `tenantId` di sini —
    // bukan dipercaya dari body (evidence-folder.service.ts::getAccessibleFolder
    // menegakkan hal yang sama untuk endpoint folder itu sendiri).
    if (dto.folderId) {
      const folder = await this.prisma.evidenceFolder.findFirst({
        where: { id: dto.folderId, tenantId },
      });
      if (!folder) {
        throw new NotFoundException('Folder tidak ditemukan');
      }
      const targetStudyProgramId = dto.ownerType === OwnerTipe.PROGRAM_STUDI ? dto.studyProgramId : null;
      if (folder.ownerType !== dto.ownerType || folder.studyProgramId !== targetStudyProgramId) {
        throw new BadRequestException('Folder tujuan harus berada di cakupan yang sama');
      }
    }

    const id = randomUUID();
    // Read back from R2, not trusted from the body — a 404 here means the client's PUT never finished.
    const { sizeBytes } = await this.storage.headObject(dto.fileKey);
    const originalFileName = extractFileNameFromKey(dto.fileKey);
    const tipeFile = (originalFileName.split('.').pop() ?? '').toLowerCase();

    const bukti = await this.prisma.evidence.create({
      data: {
        id,
        ownerType: dto.ownerType,
        tenantId,
        studyProgramId: dto.ownerType === OwnerTipe.PROGRAM_STUDI ? dto.studyProgramId : null,
        documentName: dto.documentName || originalFileName,
        fileUrl: dto.fileKey,
        fileType: tipeFile,
        sizeBytes,
        extractionStatus: StatusEkstraksi.MENUNGGU,
        uploadedByUserId: userId,
        uploadedByName: user.fullName,
        folderId: dto.folderId ?? null,
      },
    });

    await this.jobsService.enqueue(JobType.INGESTION_BUKTI_DUKUNG, {
      buktiDukungId: bukti.id,
      tenantId,
      fileUrl: dto.fileKey,
      tipeFile,
    });

    return bukti;
  }

  async findAll(studyProgramId?: string) {
    const { tenantId, role, studyProgramId: ownProdiId } =
      this.tenantContext.getOrThrow();

    if (!studyProgramId) {
      // Level tenant — docs §7: "diakses Pimpinan & Penjamin Mutu" saja.
      if (SCOPED_TO_OWN_PRODI.includes(role)) {
        throw new ForbiddenException(
          'Penyusun tidak punya akses ke perpustakaan bukti dukung level tenant',
        );
      }
      return this.prisma.evidence.findMany({
        where: { tenantId, ownerType: OwnerTipe.TENANT },
        orderBy: { uploadedAt: 'desc' },
      });
    }

    if (SCOPED_TO_OWN_PRODI.includes(role) && studyProgramId !== ownProdiId) {
      throw new ForbiddenException(
        'Penyusun hanya boleh melihat bukti dukung program studinya sendiri',
      );
    }
    return this.prisma.evidence.findMany({
      where: { tenantId, studyProgramId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async remove(id: string) {
    const { tenantId, userId, role } = this.tenantContext.getOrThrow();

    const bukti = await this.prisma.evidence.findFirst({
      where: { id, tenantId },
    });
    if (!bukti) {
      throw new NotFoundException('Bukti dukung tidak ditemukan');
    }
    if (SCOPED_TO_OWN_PRODI.includes(role) && bukti.uploadedByUserId !== userId) {
      throw new ForbiddenException(
        'Penyusun hanya boleh menghapus bukti dukung yang ia unggah sendiri',
      );
    }

    await this.prisma.evidence.delete({ where: { id } });
    try {
      await this.storage.deleteObject(bukti.fileUrl);
    } catch {
      // Object already gone (or a pre-R2 row) — not a reason to fail the row delete.
    }
  }

  /**
   * Memicu ulang ekstraksi satu baris yang gagal — sama seperti `create()`:
   * kembalikan ke MENUNGGU lalu enqueue INGESTION_BUKTI_DUKUNG dengan berkas
   * yang sama, tanpa unggah ulang. `index_evidence_chunks` (worker) sudah
   * menghapus chunk lama untuk `evidence_id` yang sama sebelum menulis yang
   * baru, jadi tidak ada pembersihan tambahan yang perlu dilakukan di sini.
   *
   * Cakupannya beda dari `remove()`: docs/application_flow.md §15 menyamakan
   * hak ulangi ekstraksi dengan hak unggah, bukan hak hapus — Penyusun boleh
   * memproses ulang bukti dukung apa pun di prodinya, bukan cuma unggahannya
   * sendiri (mengulang ekstraksi tidak menghapus atau mengubah isi berkas).
   */
  async retryIngestion(id: string) {
    const { tenantId, role, studyProgramId: ownProdiId } = this.tenantContext.getOrThrow();

    const bukti = await this.prisma.evidence.findFirst({
      where: { id, tenantId },
    });
    if (!bukti) {
      throw new NotFoundException('Bukti dukung tidak ditemukan');
    }
    if (
      SCOPED_TO_OWN_PRODI.includes(role) &&
      (bukti.ownerType !== OwnerTipe.PROGRAM_STUDI || bukti.studyProgramId !== ownProdiId)
    ) {
      throw new ForbiddenException(
        'Penyusun hanya boleh memproses ulang bukti dukung program studinya sendiri',
      );
    }
    if (bukti.extractionStatus !== StatusEkstraksi.GAGAL) {
      throw new BadRequestException(
        'Hanya bukti dukung berstatus GAGAL yang bisa diproses ulang',
      );
    }

    const updated = await this.prisma.evidence.update({
      where: { id },
      data: { extractionStatus: StatusEkstraksi.MENUNGGU, failureNote: null },
    });

    await this.jobsService.enqueue(JobType.INGESTION_BUKTI_DUKUNG, {
      buktiDukungId: bukti.id,
      tenantId,
      fileUrl: bukti.fileUrl,
      tipeFile: bukti.fileType,
    });

    return updated;
  }
}
