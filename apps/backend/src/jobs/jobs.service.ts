import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobType, type Prisma } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  ASSESSMENT_QUEUE,
  GENERATION_QUEUE,
  INGESTION_QUEUE,
  QUEUE_NAME_BY_JOB_TYPE,
} from './queue-names';

/** The only path into BullMQ — callers use enqueue() instead of injecting Queue directly, so the Postgres `Job` audit row never gets skipped. */
@Injectable()
export class JobsService {
  constructor(
    @InjectQueue(GENERATION_QUEUE) private readonly generationQueue: Queue,
    @InjectQueue(ASSESSMENT_QUEUE) private readonly assessmentQueue: Queue,
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

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
}
