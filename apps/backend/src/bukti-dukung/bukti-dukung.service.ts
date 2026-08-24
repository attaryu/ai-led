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
}
