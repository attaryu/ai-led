import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JobType, type Prisma, StatusEkstraksi, StatusRekomendasi } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BabAccessService } from './bab-access.service';
import { ConfirmRecommendationDto } from './dto/confirm-recommendation.dto';

/** GENERASI_BAB / SIMULASI_SKOR / REKOMENDASI_DOKUMEN job triggers, the recommend->confirm flow, and the chat-proxy access check. */
@Injectable()
export class BabPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jobsService: JobsService,
    private readonly access: BabAccessService,
  ) {}

  /** Enqueues GENERASI_BAB — apps/ai's worker does the actual RAG pipeline. `draftId` (recommend->confirm flow) scopes Evidence retrieval to that draft's confirmed recommendation. */
  async triggerGenerate(id: string, prompt?: string, draftId?: string) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }

    return this.jobsService.enqueue(JobType.GENERASI_BAB, {
      babDokumenId: bab.id,
      tenantId,
      createdByUserId: userId,
      ...(prompt ? { prompt } : {}),
      ...(draftId ? { draftId } : {}),
    });
  }

  /** Enqueues REKOMENDASI_DOKUMEN — apps/ai's worker builds document_query/candidate folders + an empty draft checkpoint. `draftId` set = "Rekomendasikan Ulang" (reuse that empty draft). */
  async triggerRecommendDocuments(id: string, draftId?: string) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }

    return this.jobsService.enqueue(JobType.REKOMENDASI_DOKUMEN, {
      babDokumenId: bab.id,
      tenantId,
      createdByUserId: userId,
      ...(draftId ? { draftId } : {}),
    });
  }

  /**
   * GET bab/:id/recommendation. `draftId` given -> latest row for that draft
   * (any status, e.g. right after triggering, before it's confirmed).
   * Omitted -> the chapter's active checkpoint's confirmed recommendation.
   */
  async findRecommendation(id: string, draftId?: string) {
    const bab = await this.access.findOneScoped(id);

    if (draftId) {
      const draft = await this.prisma.chapterDraft.findFirst({
        where: { id: draftId, chapterId: id },
      });
      if (!draft) {
        throw new NotFoundException('Checkpoint tidak ditemukan');
      }
      return this.prisma.documentRecommendation.findFirst({
        where: { chapterDraftId: draftId },
        orderBy: { createdAt: 'desc' },
        include: { items: { orderBy: { order: 'asc' } } },
      });
    }

    if (!bab.activeCheckpointId) {
      return null;
    }
    return this.prisma.documentRecommendation.findFirst({
      where: { chapterDraftId: bab.activeCheckpointId, status: StatusRekomendasi.DIKONFIRMASI },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  /**
   * POST bab/:id/recommend-documents/confirm. Sets the recommendation
   * DIKONFIRMASI with the user's evidence selection, then kicks extraction
   * (INGESTION_BUKTI_DUKUNG) for whichever selected evidence hasn't been
   * processed yet — same payload shape bukti-dukung.service.ts uses on
   * upload — so the user doesn't have to wait for that separately.
   */
  async confirmRecommendation(id: string, dto: ConfirmRecommendationDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    await this.access.findOneScoped(id);

    // Not trusted blindly — must belong to this chapter's own draft history.
    const recommendation = await this.prisma.documentRecommendation.findFirst({
      where: { id: dto.recommendationId, chapterDraft: { chapterId: id } },
    });
    if (!recommendation) {
      throw new NotFoundException('Rekomendasi tidak ditemukan');
    }
    if (recommendation.status !== StatusRekomendasi.DIREKOMENDASIKAN) {
      throw new ForbiddenException('Rekomendasi ini sudah dikonfirmasi atau digantikan');
    }

    const evidences = await this.prisma.evidence.findMany({
      where: { id: { in: dto.selectedEvidenceIds }, tenantId },
    });
    if (evidences.length !== dto.selectedEvidenceIds.length) {
      throw new NotFoundException('Salah satu bukti dukung yang dipilih tidak ditemukan');
    }

    const updated = await this.prisma.documentRecommendation.update({
      where: { id: dto.recommendationId },
      data: {
        status: StatusRekomendasi.DIKONFIRMASI,
        selectedEvidenceIds: dto.selectedEvidenceIds as Prisma.InputJsonValue,
      },
    });

    const pending = evidences.filter((e) => e.extractionStatus === StatusEkstraksi.MENUNGGU);
    await Promise.all(
      pending.map((e) =>
        this.jobsService.enqueue(JobType.INGESTION_BUKTI_DUKUNG, {
          buktiDukungId: e.id,
          tenantId,
          fileUrl: e.fileUrl,
          tipeFile: e.fileType,
        }),
      ),
    );

    return updated;
  }

  /** Enqueues SIMULASI_SKOR — no babDraftId means score the active content. */
  async triggerSimulateScore(id: string, babDraftId?: string) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }

    if (babDraftId) {
      const draft = await this.prisma.chapterDraft.findFirst({
        where: { id: babDraftId, chapterId: id },
      });
      if (!draft) {
        throw new NotFoundException('Checkpoint tidak ditemukan');
      }
    }

    return this.jobsService.enqueue(JobType.SIMULASI_SKOR, {
      babDokumenId: bab.id,
      tenantId,
      createdByUserId: userId,
      ...(babDraftId ? { babDraftId } : {}),
    });
  }

  /** Tenant/scope check for the chat proxy — same rules as everything else. */
  async assertChatAccess(id: string): Promise<{ userId: string }> {
    const { userId } = this.tenantContext.getOrThrow();
    await this.access.findOneScoped(id);
    return { userId };
  }
}
