import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { BabDokumenController } from './bab-dokumen.controller';
import { BabDokumenService } from './bab-dokumen.service';

@Module({
  imports: [JobsModule],
  controllers: [BabDokumenController],
  providers: [BabDokumenService],
  exports: [BabDokumenService],
})
export class BabDokumenModule {}
