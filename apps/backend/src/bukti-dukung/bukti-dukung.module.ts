import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { BuktiDukungController } from './bukti-dukung.controller';
import { BuktiDukungService } from './bukti-dukung.service';

@Module({
  imports: [JobsModule],
  controllers: [BuktiDukungController],
  providers: [BuktiDukungService],
})
export class BuktiDukungModule {}
