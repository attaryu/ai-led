import { Module } from '@nestjs/common';
import { BabDokumenController } from './bab-dokumen.controller';
import { BabDokumenService } from './bab-dokumen.service';

@Module({
  controllers: [BabDokumenController],
  providers: [BabDokumenService],
  exports: [BabDokumenService],
})
export class BabDokumenModule {}
