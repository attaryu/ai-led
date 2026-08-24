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

  /** PENYUSUN is scoped to their one assigned program studi; every other role is tenant-wide. */
  private assertProgramStudiScope(studyProgramId: string): void {
    const { role, studyProgramId: assignedId } =
      this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && assignedId !== studyProgramId) {
      throw new ForbiddenException(
        'Anda hanya bisa mengakses program studi tempat Anda ditugaskan',
      );
    }
  }

  private async assertProgramStudiInTenant(
    studyProgramId: string,
  ): Promise<void> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const studyProgram = await this.prisma.studyProgram.findFirst({
      where: { id: studyProgramId, tenantId },
      select: { id: true },
    });
    if (!studyProgram) {
      throw new NotFoundException('Program studi tidak ditemukan');
    }
    this.assertProgramStudiScope(studyProgramId);
  }

  async create(studyProgramId: string, dto: CreateDokumenLedDto) {
    await this.assertProgramStudiInTenant(studyProgramId);
    return this.prisma.ledDocument.create({
      data: { ...dto, studyProgramId, overallStatus: StatusDokumen.DRAFT },
    });
  }

  async findAllForProgramStudi(studyProgramId: string) {
    await this.assertProgramStudiInTenant(studyProgramId);
    return this.prisma.ledDocument.findMany({
      where: { studyProgramId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Seluruh Dokumen LED tenant lintas prodi, satu query (bukan 1+N). */
  async findAllForTenant() {
    const { tenantId, role, studyProgramId } = this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && !studyProgramId) return [];

    return this.prisma.ledDocument.findMany({
      where: {
        studyProgram: { tenantId },
        ...(role === Role.PENYUSUN ? { studyProgramId: studyProgramId ?? undefined } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const dokumen = await this.prisma.ledDocument.findFirst({
      where: { id, studyProgram: { tenantId } },
    });
    if (!dokumen) {
      throw new NotFoundException('Dokumen LED tidak ditemukan');
    }
    this.assertProgramStudiScope(dokumen.studyProgramId);
    return dokumen;
  }

  async update(id: string, dto: UpdateDokumenLedDto) {
    await this.findOne(id);
    return this.prisma.ledDocument.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.ledDocument.delete({ where: { id } });
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
      programStudiId: dokumen.studyProgramId,
      createdByUserId: userId, // NOT NULL FK on assessment_sessions
      indikatorList: dto?.indikatorList, // omitted (not []) means "assess all"
      ...(dto?.sumberLed ? { sumberLed: dto.sumberLed } : {}),
      ...(dto?.ledFileName ? { ledFileName: dto.ledFileName } : {}),
      ...(dto?.lkpsBuktiDukungId ? { lkpsBuktiDukungId: dto.lkpsBuktiDukungId } : {}),
      ...(dto?.laporanBuktiDukungId ? { laporanBuktiDukungId: dto.laporanBuktiDukungId } : {}),
    });
  }

  /** LED already sits in R2 (client uploaded via presigned PUT) — reads it back and forwards it as multipart to apps/ai's POST /upload/led. */
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
      // Buffer's ArrayBufferLike isn't a valid BlobPart; Uint8Array copies it into one that is.
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

