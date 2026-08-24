import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { StatusDokumen } from '@ai-led/db';
import { CreateDokumenLedDto } from './create-dokumen-led.dto';

export class UpdateDokumenLedDto extends PartialType(CreateDokumenLedDto) {
  @IsOptional()
  @IsEnum(StatusDokumen)
  overallStatus?: StatusDokumen;
}
