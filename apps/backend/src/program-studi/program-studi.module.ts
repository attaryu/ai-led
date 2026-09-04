import { Module } from '@nestjs/common';
import { ProgramStudiController } from './program-studi.controller';
import { ProgramStudiService } from './program-studi.service';

@Module({
  controllers: [ProgramStudiController],
  providers: [ProgramStudiService],
  exports: [ProgramStudiService],
})
export class ProgramStudiModule {}
