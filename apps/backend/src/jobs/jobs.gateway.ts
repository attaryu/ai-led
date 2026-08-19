import { Controller, MessageEvent, NotFoundException, Param, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable, map, startWith, takeWhile } from 'rxjs';
import { PrismaService } from '../database/prisma.service';
import { Protected } from '../tenant/protected.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { JobEventsService, JobUpdate } from './job-events.service';

/**
 * Realtime job status (tracker row 18). SSE, not a WebSocket gateway: the
 * only direction of traffic is server -> client progress updates, and this
 * backend already streams SSE for chat (row 21) — no new dependency
 * (@nestjs/websockets/socket.io) needed for a one-way feed.
 */
@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsGateway {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jobEvents: JobEventsService,
  ) {}

  @Sse(':id/events')
  @Protected()
  async events(@Param('id') id: string): Promise<Observable<MessageEvent>> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const job = await this.prisma.job.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException('Job not found');

    const initial: JobUpdate = {
      jobId: job.bullJobId,
      status: job.status === 'FAILED' ? 'failed' : job.status === 'COMPLETED' ? 'completed' : 'progress',
      progress: job.progress,
      result: job.result ?? undefined,
      error: job.error ?? undefined,
    };

    return this.jobEvents.forJob(job.queueName, job.bullJobId).pipe(
      startWith(initial),
      map((update): MessageEvent => ({ data: update })),
      takeWhile((message) => {
        const status = (message.data as JobUpdate).status;
        return status !== 'completed' && status !== 'failed';
      }, true),
    );
  }
}
