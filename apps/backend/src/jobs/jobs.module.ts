import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Redis } from 'ioredis';
import { requireEnv } from '../config/env';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { ASSESSMENT_QUEUE, GENERATION_QUEUE, INGESTION_QUEUE } from './queue-names';

// BullMQ default job retention keeps every completed/failed job forever,
// yang persis risiko "penumpukan memori Redis" di Temuan Kendala tracker.
// attempts/backoff disetel di producer, bukan consumer — BullMQ menyimpannya
// di Redis, jadi worker bahasa apa pun otomatis mengikuti.
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
        // `maxRetriesPerRequest: null` wajib untuk koneksi BullMQ (persyaratan
        // library-nya sendiri, bukan pilihan) — retry command dikelola BullMQ,
        // bukan ioredis.
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
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
