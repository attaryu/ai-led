import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JobType } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BabAccessService } from './bab-access.service';

/** GENERASI_BAB / SIMULASI_SKOR job triggers, and the chat-proxy access check. */
@Injectable()
export class BabPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jobsService: JobsService,
    private readonly access: BabAccessService,
  ) {}

  /** Enqueues GENERASI_BAB — apps/ai's worker does the actual RAG pipeline. */
  async triggerGenerate(id: string, prompt?: string) {
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
    });
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
