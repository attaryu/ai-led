import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { DokumenLedController } from './dokumen-led.controller';
import { DokumenLedService } from './dokumen-led.service';

@Module({
  imports: [JobsModule, StorageModule],
  controllers: [DokumenLedController],
  providers: [DokumenLedService],
  exports: [DokumenLedService],
})
export class DokumenLedModule {}

