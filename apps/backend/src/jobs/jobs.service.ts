import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { JobType, type Prisma } from '@ai-led/db';
import { requireEnv } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  ASSESSMENT_QUEUE,
  GENERATION_QUEUE,
  INGESTION_QUEUE,
  QUEUE_NAME_BY_JOB_TYPE,
} from './queue-names';

/** TTL for the cancel flag in Redis — long enough to outlive any realistic
 * job run (ASSESSMENT_AMI's 64-indicator pass is the longest, well under an
 * hour), short enough not to accumulate stale keys forever. */
const CANCEL_FLAG_TTL_SECONDS = 3600;

function cancelFlagKey(bullJobId: string): string {
  return `job:cancel:${bullJobId}`;
}

/** The only path into BullMQ — callers use enqueue() instead of injecting Queue directly, so the Postgres `Job` audit row never gets skipped. */
@Injectable()
export class JobsService implements OnModuleDestroy {
  // Dedicated connection for the cancel flag, same pattern as JobEventsService
  // — Queue doesn't expose its underlying ioredis client on this bullmq version.
  private readonly redis = new Redis(requireEnv('REDIS_URL'), { maxRetriesPerRequest: null });

  constructor(
    @InjectQueue(GENERATION_QUEUE) private readonly generationQueue: Queue,
    @InjectQueue(ASSESSMENT_QUEUE) private readonly assessmentQueue: Queue,
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private queueFor(type: JobType): Queue {
    switch (type) {
      case JobType.GENERASI_BAB:
      case JobType.SIMULASI_SKOR:
      case JobType.REKOMENDASI_DOKUMEN:
        return this.generationQueue;
      case JobType.ASSESSMENT_AMI:
        return this.assessmentQueue;
      case JobType.INGESTION_BUKTI_DUKUNG:
        return this.ingestionQueue;
    }
  }

  async enqueue(type: JobType, payload: Record<string, unknown>) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const queue = this.queueFor(type);
    const bullJob = await queue.add(type, payload);

    return this.prisma.job.create({
      data: {
        tenantId,
        createdByUserId: userId,
        type,
        queueName: QUEUE_NAME_BY_JOB_TYPE[type],
        bullJobId: bullJob.id!,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Cancel a running (or still-queued) job — tenant-scoped, matching every
   * other job lookup here.
   *
   * Two mechanisms, because a job can be in either state when this is
   * called: still WAITING in the queue is removed outright (never dispatched,
   * nothing to cooperate with). Already ACTIVE means a worker process — a
   * separate Python process for every job type here — is mid-loop; NestJS
   * can't reach into it directly, so it sets a Redis flag under the SAME
   * `bullJobId` the worker already has in scope, and the worker (currently
   * only `_handle_assessment_ami`'s `_run_assessment_pipeline` loop — the
   * only job type long enough for cancellation to matter) polls it between
   * indicators and stops dispatching new ones once it sees it. Cancelling an
   * already-completed/failed job is a harmless no-op either way.
   */
  async cancel(jobId: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const job = await this.prisma.job.findFirst({ where: { id: jobId, tenantId } });
    if (!job) throw new NotFoundException('Job not found');

    const queue = this.queueFor(job.type);
    const bullJob = await queue.getJob(job.bullJobId);
    if (bullJob) {
      const state = await bullJob.getState();
      if (state === 'waiting' || state === 'delayed') {
        await bullJob.remove();
      }
    }

    await this.redis.set(cancelFlagKey(job.bullJobId), '1', 'EX', CANCEL_FLAG_TTL_SECONDS);
  }
}
