import { Module } from '@nestjs/common';
import { DokumenLedController } from './dokumen-led.controller';
import { DokumenLedService } from './dokumen-led.service';

@Module({
  controllers: [DokumenLedController],
  providers: [DokumenLedService],
  exports: [DokumenLedService],
})
export class DokumenLedModule {}
