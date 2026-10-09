import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccreditationSetStatus, EvidenceKind, JobType, Prisma, Role, StatusDokumen } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { extractFileNameFromKey } from '../storage/storage-key.util';
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

  /** Set Akreditasi harus milik tenant ini dan sudah SIAP -- FK sendiri tidak menahan set tenant lain. */
  private async assertSelectableSet(accreditationSetId: string | undefined): Promise<void> {
    if (!accreditationSetId) return;
    const { tenantId } = this.tenantContext.getOrThrow();
    const set = await this.prisma.accreditationSet.findFirst({
      where: { id: accreditationSetId, tenantId },
      select: { status: true },
    });
    if (!set) throw new NotFoundException('Set Akreditasi tidak ditemukan');
    if (set.status !== AccreditationSetStatus.SIAP) {
      throw new ConflictException('Set Akreditasi masih DRAF -- tandai SIAP dulu sebelum dipakai dokumen');
    }
  }

  async create(studyProgramId: string, dto: CreateDokumenLedDto) {
    await this.assertProgramStudiInTenant(studyProgramId);
    await this.assertSelectableSet(dto.accreditationSetId);
    // LKPS dipilih sejak dokumen dibuat: harus LKPS prodi ini, bukan LKPS prodi lain.
    // Semua isian wajib untuk dokumen baru (form web sudah menegakkannya; ini menahan panggilan API langsung).
    if (!dto.title?.trim() || !dto.academicYear?.trim() || !dto.deadline || !dto.accreditationSetId) {
      throw new BadRequestException('Judul, tahun akademik, target selesai, dan acuan penilaian wajib diisi');
    }
    // ponytail: dulu opsional (`if (dto.lkpsEvidenceId) {...}`); kini wajib untuk dokumen baru.
    if (!dto.lkpsEvidenceId) {
      throw new BadRequestException('LKPS wajib dipilih untuk membuat Dokumen LED');
    }
    await this.assertDocumentLkps({ studyProgramId }, dto.lkpsEvidenceId);
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
        ...(role === Role.PENYUSUN
          ? { studyProgramId: studyProgramId ?? undefined }
          : {}),
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
    const dokumen = await this.findOne(id);
    if (dto.accreditationSetId !== dokumen.accreditationSetId) {
      await this.assertSelectableSet(dto.accreditationSetId);
    }
    if (dto.lkpsEvidenceId && dto.lkpsEvidenceId !== dokumen.lkpsEvidenceId) {
      await this.assertDocumentLkps(dokumen, dto.lkpsEvidenceId);
    }
    return this.prisma.ledDocument.update({ where: { id }, data: dto });
  }

  /** The LKPS must be an LKPS file of the document's prodi -- it is already indexed on upload (INGESTION_LKPS). */
  private async assertDocumentLkps(
    dokumen: { studyProgramId: string },
    lkpsEvidenceId: string,
  ) {
    const lkps = await this.prisma.evidence.findFirst({
      where: { id: lkpsEvidenceId, studyProgramId: dokumen.studyProgramId, kind: EvidenceKind.LKPS },
    });
    if (!lkps) {
      throw new NotFoundException('Berkas LKPS tidak ditemukan di LKPS prodi ini');
    }
  }

  /**
   * Hapus dokumen beserta seluruh isinya dalam satu transaksi — bab, draft,
   * chat, skor, tautan bukti dukung, sesi/verdict AMI, dan chunk embedding.
   * Urutan mengikuti FK anak-ke-induk; `activeCheckpointId` diputus lebih
   * dulu karena bab <-> draft saling menunjuk (draft aktifnya).
   */
  async remove(id: string) {
    await this.findOne(id);
    const { tenantId } = this.tenantContext.getOrThrow();

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.tenantContext.runInManagedTransaction(async () => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
          const chapterIds = (
            await tx.documentChapter.findMany({
              where: { documentId: id },
              select: { id: true },
            })
          ).map((c) => c.id);

          const draftIds = (
            await tx.chapterDraft.findMany({
              where: { chapterId: { in: chapterIds } },
              select: { id: true },
            })
          ).map((d) => d.id);

          const sectionIds = (
            await tx.chapterSection.findMany({
              where: { chapterId: { in: chapterIds } },
              select: { id: true },
            })
          ).map((s) => s.id);

          await tx.documentChapter.updateMany({
            where: { id: { in: chapterIds } },
            data: { activeCheckpointId: null },
          });
          await tx.chapterSection.updateMany({
            where: { id: { in: sectionIds } },
            data: { activeCheckpointId: null },
          });

          await tx.evalResult.deleteMany({
            where: { generationRun: { chapterDraftId: { in: draftIds } } },
          });
          await tx.generationRun.deleteMany({
            where: { chapterDraftId: { in: draftIds } },
          });
          await tx.evidenceDraftLink.deleteMany({
            where: { draftId: { in: draftIds } },
          });
          await tx.criterionScoreResult.deleteMany({
            where: {
              OR: [
                { chapterId: { in: chapterIds } },
                { draftId: { in: draftIds } },
              ],
            },
          });
          await tx.ragasScore.deleteMany({
            where: {
              OR: [
                { chapterId: { in: chapterIds } },
                { chapterDraftId: { in: draftIds } },
              ],
            },
          });
          await tx.chatMessage.deleteMany({
            where: { sectionId: { in: sectionIds } },
          });
          await tx.evidenceChapterLink.deleteMany({
            where: { chapterId: { in: chapterIds } },
          });

          // writing_document_recommendations + writing_recommendation_items ikut
          // lewat ON DELETE CASCADE di DB saat draft-nya dihapus di bawah ini.
          await tx.chapterDraft.deleteMany({ where: { id: { in: draftIds } } });
          await tx.documentChapter.deleteMany({ where: { documentId: id } });

          await tx.assessmentVerdict.deleteMany({ where: { documentId: id } });
          await tx.assessmentSession.deleteMany({ where: { documentId: id } });
          await tx.ledChunkEmbedding.deleteMany({ where: { documentId: id } });
          await tx.ledDocument.delete({ where: { id } });
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'Dokumen LED ini masih terpakai baris lain yang belum bisa dihapus otomatis',
        );
      }
      throw err;
    }
  }

  async triggerAssessment(id: string, dto?: TriggerAssessmentDto) {
    const dokumen = await this.findOne(id);
    const { tenantId, userId } = this.tenantContext.getOrThrow();

    // No document LKPS yet: the one picked for this assessment becomes the document's LKPS for writing too.
    if (dto?.lkpsBuktiDukungId && !dokumen.lkpsEvidenceId) {
      await this.assertDocumentLkps(dokumen, dto.lkpsBuktiDukungId);
      await this.prisma.ledDocument.update({
        where: { id: dokumen.id },
        data: { lkpsEvidenceId: dto.lkpsBuktiDukungId },
      });
    }

    return this.jobsService.enqueue(JobType.ASSESSMENT_AMI, {
      dokumenId: dokumen.id,
      tenantId,
      programStudiId: dokumen.studyProgramId,
      createdByUserId: userId, // NOT NULL FK on assessment_sessions
      indikatorList: dto?.indikatorList, // omitted (not []) means "assess all"
      ...(dto?.subIndikatorList?.length ? { subIndikatorList: dto.subIndikatorList } : {}),
      ...(dto?.sumberLed ? { sumberLed: dto.sumberLed } : {}),
      ...(dto?.ledFileName ? { ledFileName: dto.ledFileName } : {}),
      // LKPS milik dokumen menang atas kiriman klien: LKPS terhubung ke dokumen LED, dan AMI
      // memakai LKPS dokumen yang sedang dinilai. Kiriman klien hanya dipakai bila dokumen
      // belum punya LKPS (kasus di atas yang menjadikannya LKPS dokumen).
      ...((dokumen.lkpsEvidenceId ?? dto?.lkpsBuktiDukungId)
        ? { lkpsBuktiDukungId: dokumen.lkpsEvidenceId ?? dto?.lkpsBuktiDukungId }
        : {}),
      // ...(dto?.lkpsBuktiDukungId
      //   ? { lkpsBuktiDukungId: dto.lkpsBuktiDukungId }
      //   : {}),
      ...(dto?.laporanBuktiDukungId
        ? { laporanBuktiDukungId: dto.laporanBuktiDukungId }
        : {}),
      ...(dto?.model ? { model: dto.model } : {}),
    });
  }

  /** LED already sits in R2 (presigned PUT) -- record its key and let the worker ingest it (architecture rule 3). */
  async confirmLedUpload(id: string, dto: ConfirmLedUploadDto) {
    const dokumen = await this.findOne(id);
    const { tenantId } = this.tenantContext.getOrThrow();

    if (!dto.fileKey.startsWith(`${tenantId}/`)) {
      throw new ForbiddenException('fileKey ini bukan milik tenant Anda');
    }

    const fileName = extractFileNameFromKey(dto.fileKey);
    if (!LED_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext))) {
      throw new ConflictException(
        'Berkas LED harus PDF (.pdf) atau Word (.docx)',
      );
    }

    await this.prisma.ledDocument.update({
      where: { id: dokumen.id },
      data: { ledFileKey: dto.fileKey },
    });
    return this.jobsService.enqueue(JobType.INGESTION_LED, {
      dokumenId: dokumen.id,
      tenantId,
      fileUrl: dto.fileKey,
    });
  }
}
