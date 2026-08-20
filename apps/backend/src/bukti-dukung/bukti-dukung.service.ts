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

// docs/database.md §7 "Fitur terkait": PIMPINAN & PENJAMIN_MUTU boleh
// upload/hapus di scope manapun; PENYUSUN cuma di prodi tempatnya
// ditugaskan, dan cuma boleh hapus berkas yang ia unggah sendiri. ADMIN
// tidak disebut sama sekali — tidak dapat akses bukti dukung.
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
    const { tenantId, userId, role, programStudiId } =
      this.tenantContext.getOrThrow();

    // `fileKey` datang dari klien (baris balasan /storage/presigned-upload) —
    // dicek di sini juga, bukan cuma di StorageController, supaya baris
    // BuktiDukung tidak pernah bisa dibuat menunjuk objek tenant lain
    // walau lewat jalur yang berbeda.
    if (!dto.fileKey.startsWith(`${tenantId}/`)) {
      throw new ForbiddenException('fileKey ini bukan milik tenant Anda');
    }

    if (dto.ownerTipe === OwnerTipe.PROGRAM_STUDI) {
      if (!dto.programStudiId) {
        throw new BadRequestException(
          'programStudiId wajib diisi untuk ownerTipe PROGRAM_STUDI',
        );
      }
      if (SCOPED_TO_OWN_PRODI.includes(role) && dto.programStudiId !== programStudiId) {
        throw new ForbiddenException(
          'Penyusun hanya boleh mengunggah bukti dukung untuk program studinya sendiri',
        );
      }
      const prodi = await this.prisma.programStudi.findFirst({
        where: { id: dto.programStudiId, tenantId },
      });
      if (!prodi) {
        throw new NotFoundException('Program studi tidak ditemukan');
      }
    } else if (dto.programStudiId) {
      throw new BadRequestException(
        'programStudiId harus kosong untuk ownerTipe TENANT',
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
    // Membaca ulang dari R2, bukan mempercayai body request: gagal di sini
    // (404) berarti klien belum benar-benar menyelesaikan PUT ke presigned
    // URL-nya sebelum memanggil endpoint ini.
    const { sizeBytes } = await this.storage.headObject(dto.fileKey);
    const originalFileName = extractFileNameFromKey(dto.fileKey);
    const tipeFile = (originalFileName.split('.').pop() ?? '').toLowerCase();

    const bukti = await this.prisma.buktiDukung.create({
      data: {
        id,
        ownerTipe: dto.ownerTipe,
        tenantId,
        programStudiId: dto.ownerTipe === OwnerTipe.PROGRAM_STUDI ? dto.programStudiId : null,
        namaDokumen: dto.namaDokumen || originalFileName,
        fileUrl: dto.fileKey,
        tipeFile,
        ukuranBytes: sizeBytes,
        statusEkstraksi: StatusEkstraksi.MENUNGGU,
        diunggahOlehUserId: userId,
        diunggahOlehNama: user.namaLengkap,
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

  async findAll(programStudiId?: string) {
    const { tenantId, role, programStudiId: ownProdiId } =
      this.tenantContext.getOrThrow();

    if (!programStudiId) {
      // Level tenant — docs §7: "diakses Pimpinan & Penjamin Mutu" saja.
      if (SCOPED_TO_OWN_PRODI.includes(role)) {
        throw new ForbiddenException(
          'Penyusun tidak punya akses ke perpustakaan bukti dukung level tenant',
        );
      }
      return this.prisma.buktiDukung.findMany({
        where: { tenantId, ownerTipe: OwnerTipe.TENANT },
        orderBy: { waktuDiunggah: 'desc' },
      });
    }

    if (SCOPED_TO_OWN_PRODI.includes(role) && programStudiId !== ownProdiId) {
      throw new ForbiddenException(
        'Penyusun hanya boleh melihat bukti dukung program studinya sendiri',
      );
    }
    return this.prisma.buktiDukung.findMany({
      where: { tenantId, programStudiId },
      orderBy: { waktuDiunggah: 'desc' },
    });
  }

  async remove(id: string) {
    const { tenantId, userId, role } = this.tenantContext.getOrThrow();

    const bukti = await this.prisma.buktiDukung.findFirst({
      where: { id, tenantId },
    });
    if (!bukti) {
      throw new NotFoundException('Bukti dukung tidak ditemukan');
    }
    if (SCOPED_TO_OWN_PRODI.includes(role) && bukti.diunggahOlehUserId !== userId) {
      throw new ForbiddenException(
        'Penyusun hanya boleh menghapus bukti dukung yang ia unggah sendiri',
      );
    }

    await this.prisma.buktiDukung.delete({ where: { id } });
    try {
      await this.storage.deleteObject(bukti.fileUrl);
    } catch {
      // Objek sudah tidak ada (atau baris lama dari sebelum migrasi R2) —
      // bukan alasan menggagalkan penghapusan barisnya.
    }
  }
}
