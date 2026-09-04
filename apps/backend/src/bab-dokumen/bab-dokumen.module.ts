import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { BabAccessService } from './bab-access.service';
import { BabDokumenController } from './bab-dokumen.controller';
import { BabDokumenService } from './bab-dokumen.service';
import { BabDraftService } from './bab-draft.service';
import { BabPipelineService } from './bab-pipeline.service';
import { BabReviewService } from './bab-review.service';

@Module({
  imports: [JobsModule],
  controllers: [BabDokumenController],
  providers: [
    BabAccessService,
    BabDokumenService,
    BabDraftService,
    BabReviewService,
    BabPipelineService,
  ],
})
export class BabDokumenModule {}
