import { Module } from '@nestjs/common';
import { DokumenLedModule } from '../dokumen-led/dokumen-led.module';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';

@Module({
  imports: [DokumenLedModule],
  controllers: [AssessmentController],
  providers: [AssessmentService],
})
export class AssessmentModule {}
