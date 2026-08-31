import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusDokumen } from '@ai-led/db';
import { CreateDokumenLedDto } from './create-dokumen-led.dto';

export class UpdateDokumenLedDto extends PartialType(CreateDokumenLedDto) {
  @IsOptional()
  @IsEnum(StatusDokumen)
  overallStatus?: StatusDokumen;

  // Acuan penilaian (Set Akreditasi) yang dipakai dokumen ini -- lihat
  // accreditation-set.entity.ts. Tidak divalidasi ada/tidaknya di sini
  // (beda tenant dari CreateDokumenLedDto's studyProgram check) karena
  // frontend hanya menawarkan set berstatus SIAP milik tenant sendiri
  // lewat accreditationSetRepository.findSelectable().
  @IsOptional()
  @IsString()
  accreditationSetId?: string;
}
