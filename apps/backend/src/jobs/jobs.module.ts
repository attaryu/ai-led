import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Redis } from 'ioredis';
import { requireEnv } from '../config/env';
import { JobEventsService } from './job-events.service';
import { JobsController } from './jobs.controller';
import { JobsGateway } from './jobs.gateway';
import { JobsService } from './jobs.service';
import { ASSESSMENT_QUEUE, GENERATION_QUEUE, INGESTION_QUEUE } from './queue-names';

// Caps job retention (unbounded default risks Redis memory growth). attempts/backoff live here
// (producer), not the consumer — BullMQ stores them in Redis so any worker language honors them.
const defaultJobOptions = {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
};

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        // `maxRetriesPerRequest: null` is required by BullMQ itself — it manages command retries, not ioredis.
        connection: new Redis(requireEnv('REDIS_URL'), {
          maxRetriesPerRequest: null,
        }),
      }),
    }),
    BullModule.registerQueue(
      { name: GENERATION_QUEUE, defaultJobOptions },
      { name: ASSESSMENT_QUEUE, defaultJobOptions },
      { name: INGESTION_QUEUE, defaultJobOptions },
    ),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature(
      { name: GENERATION_QUEUE, adapter: BullMQAdapter },
      { name: ASSESSMENT_QUEUE, adapter: BullMQAdapter },
      { name: INGESTION_QUEUE, adapter: BullMQAdapter },
    ),
  ],
  controllers: [JobsController, JobsGateway],
  providers: [JobsService, JobEventsService],
  exports: [JobsService],
})
export class JobsModule {}
