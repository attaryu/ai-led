import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobType, Prisma, Role, StatusDokumen } from '@ai-led/db';
import { requireEnv } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { extractFileNameFromKey } from '../storage/storage-key.util';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ConfirmLedUploadDto } from './dto/confirm-led-upload.dto';
import { CreateDokumenLedDto } from './dto/create-dokumen-led.dto';
import { TriggerAssessmentDto } from './dto/trigger-assessment.dto';
import { UpdateDokumenLedDto } from './dto/update-dokumen-led.dto';

const LED_EXTENSIONS = ['.pdf', '.docx'];

@Injectable()
export class DokumenLedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jobsService: JobsService,
    private readonly storage: StorageService,
  ) {}

  // PENYUSUN is scoped to the single program studi they're assigned to;
  // every other role operates tenant-wide.
  private assertProgramStudiScope(programStudiId: string): void {
    const { role, programStudiId: assignedId } =
      this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && assignedId !== programStudiId) {
      throw new ForbiddenException(
        'Anda hanya bisa mengakses program studi tempat Anda ditugaskan',
      );
    }
  }

  private async assertProgramStudiInTenant(
    programStudiId: string,
  ): Promise<void> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const programStudi = await this.prisma.programStudi.findFirst({
      where: { id: programStudiId, tenantId },
      select: { id: true },
    });
    if (!programStudi) {
      throw new NotFoundException('Program studi tidak ditemukan');
    }
    this.assertProgramStudiScope(programStudiId);
  }

  async create(programStudiId: string, dto: CreateDokumenLedDto) {
    await this.assertProgramStudiInTenant(programStudiId);
    return this.prisma.dokumenLed.create({
      data: { ...dto, programStudiId, statusKeseluruhan: StatusDokumen.DRAFT },
    });
  }

  async findAllForProgramStudi(programStudiId: string) {
    await this.assertProgramStudiInTenant(programStudiId);
    return this.prisma.dokumenLed.findMany({
      where: { programStudiId },
      orderBy: { dibuatPada: 'desc' },
    });
  }

  /** Seluruh Dokumen LED tenant lintas prodi, satu query (bukan 1+N). */
  async findAllForTenant() {
    const { tenantId, role, programStudiId } = this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && !programStudiId) return [];

    return this.prisma.dokumenLed.findMany({
      where: {
        programStudi: { tenantId },
        ...(role === Role.PENYUSUN ? { programStudiId: programStudiId ?? undefined } : {}),
      },
      orderBy: { dibuatPada: 'desc' },
    });
  }

  async findOne(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const dokumen = await this.prisma.dokumenLed.findFirst({
      where: { id, programStudi: { tenantId } },
    });
    if (!dokumen) {
      throw new NotFoundException('Dokumen LED tidak ditemukan');
    }
    this.assertProgramStudiScope(dokumen.programStudiId);
    return dokumen;
  }

  async update(id: string, dto: UpdateDokumenLedDto) {
    await this.findOne(id);
    return this.prisma.dokumenLed.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.dokumenLed.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'Dokumen LED ini masih punya bab — hapus seluruh babnya terlebih dahulu',
        );
      }
      throw err;
    }
  }

  async triggerAssessment(id: string, dto?: TriggerAssessmentDto) {
    const dokumen = await this.findOne(id);
    const { tenantId, userId } = this.tenantContext.getOrThrow();

    return this.jobsService.enqueue(JobType.ASSESSMENT_AMI, {
      dokumenId: dokumen.id,
      tenantId,
      programStudiId: dokumen.programStudiId,
      // Required — assessment_sessions.created_by_user_id is a NOT NULL FK
      // (db/postgres_client.py::create_session), unlike the old Supabase
      // tables which had no user concept at all.
      createdByUserId: userId,
      // Omitted (not []) when unspecified — an empty array would read as
      // "assess zero indicators" downstream, not "assess all of them".
      indikatorList: dto?.indikatorList,
      ...(dto?.sumberLed ? { sumberLed: dto.sumberLed } : {}),
      ...(dto?.ledFileName ? { ledFileName: dto.ledFileName } : {}),
      ...(dto?.lkpsBuktiDukungId ? { lkpsBuktiDukungId: dto.lkpsBuktiDukungId } : {}),
      ...(dto?.laporanBuktiDukungId ? { laporanBuktiDukungId: dto.laporanBuktiDukungId } : {}),
    });
  }

  /**
   * PDF LED sudah sampai ke R2 langsung dari browser (POST
   * /storage/presigned-upload lalu PUT ke R2) — di sini cuma mengambil
   * baliknya dari R2 lalu meneruskannya sebagai multipart ke apps/ai's
   * POST /upload/led, yang mengerjakan ekstraksi+indexing pgvector-nya
   * sendiri, tidak berubah sama sekali. Frontend tidak pernah bicara
   * langsung ke apps/ai, aturan yang sama dengan proxy chat SSE.
   */
  async confirmLedUpload(id: string, dto: ConfirmLedUploadDto) {
    const dokumen = await this.findOne(id);
    const { tenantId } = this.tenantContext.getOrThrow();

    if (!dto.fileKey.startsWith(`${tenantId}/`)) {
      throw new ForbiddenException('fileKey ini bukan milik tenant Anda');
    }

    const fileName = extractFileNameFromKey(dto.fileKey);
    if (!LED_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext))) {
      throw new ConflictException('Berkas LED harus PDF (.pdf) atau Word (.docx)');
    }

    const { bytes, contentType } = await this.storage.getObjectBytes(dto.fileKey);

    const aiServiceUrl = requireEnv('AI_SERVICE_URL');
    const form = new FormData();
    form.append('tenant_id', tenantId);
    form.append('dokumen_id', dokumen.id);
    form.append(
      // `new Uint8Array(bytes)` copies into a fresh ArrayBuffer — Buffer's
      // own type is ArrayBufferLike (could be a SharedArrayBuffer), which
      // Blob's BlobPart type doesn't accept.
      'file',
      new Blob([new Uint8Array(bytes)], { type: contentType ?? 'application/octet-stream' }),
      fileName,
    );

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/upload/led`, { method: 'POST', body: form });
    } catch {
      throw new BadGatewayException('AI service tidak dapat dihubungi');
    }
    if (!upstream.ok) {
      throw new BadGatewayException('Gagal mengunggah LED ke AI service');
    }
    return upstream.json();
  }
}

