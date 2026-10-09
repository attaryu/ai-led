import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { AccreditationSetController } from './accreditation-set.controller';
import { PanduanController } from './panduan.controller';
import { AccreditationSetService } from './accreditation-set.service';

@Module({
  imports: [StorageModule, JobsModule],
  controllers: [AccreditationSetController, PanduanController],
  providers: [AccreditationSetService],
})
export class AccreditationSetModule {}
