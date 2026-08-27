import { Module } from '@nestjs/common';
import { EvidenceFolderController } from './evidence-folder.controller';
import { EvidenceFolderService } from './evidence-folder.service';

@Module({
  controllers: [EvidenceFolderController],
  providers: [EvidenceFolderService],
})
export class EvidenceFolderModule {}
