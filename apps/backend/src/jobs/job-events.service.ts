import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { Observable, fromEvent, merge } from 'rxjs';
import { filter, share } from 'rxjs/operators';
import { requireEnv } from '../config/env';
import { QUEUE_NAMES } from './queue-names';

export interface JobUpdate {
  jobId: string;
  status: 'progress' | 'completed' | 'failed';
  progress?: unknown;
  result?: unknown;
  error?: string;
}

/** One QueueEvents connection per queue, shared via a multicast Observable — per-request would leak a Redis connection per tab. */
@Injectable()
export class JobEventsService implements OnModuleDestroy {
  private readonly queueEvents: QueueEvents[] = [];
  private readonly streams = new Map<string, Observable<JobUpdate>>();

  constructor() {
    for (const queueName of QUEUE_NAMES) {
      const events = new QueueEvents(queueName, {
        connection: new Redis(requireEnv('REDIS_URL'), { maxRetriesPerRequest: null }),
      });
      this.queueEvents.push(events);

      const stream = merge(
        fromEvent(events, 'progress', (args: { jobId: string; data: unknown }): JobUpdate => ({
          jobId: args.jobId,
          status: 'progress',
          progress: args.data,
        })),
        fromEvent(
          events,
          'completed',
          (args: { jobId: string; returnvalue: unknown }): JobUpdate => ({
            jobId: args.jobId,
            status: 'completed',
            progress: 100,
            result: args.returnvalue,
          }),
        ),
        fromEvent(events, 'failed', (args: { jobId: string; failedReason: string }): JobUpdate => ({
          jobId: args.jobId,
          status: 'failed',
          error: args.failedReason,
        })),
      ).pipe(share());

      this.streams.set(queueName, stream);
    }
  }

  /** Realtime updates for one job, scoped to its queue and filtered to its id. */
  forJob(queueName: string, bullJobId: string): Observable<JobUpdate> {
    const stream = this.streams.get(queueName);
    if (!stream) throw new Error(`Unknown queue: ${queueName}`);
    return stream.pipe(filter((update) => update.jobId === bullJobId));
  }

  async onModuleDestroy() {
    await Promise.all(this.queueEvents.map((events) => events.close()));
  }
}
