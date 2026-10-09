import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusDokumen } from '@ai-led/db';
import { CreateDokumenLedDto } from './create-dokumen-led.dto';

export class UpdateDokumenLedDto extends PartialType(CreateDokumenLedDto) {
  @ApiPropertyOptional({ enum: StatusDokumen })
  @IsOptional()
  @IsEnum(StatusDokumen)
  overallStatus?: StatusDokumen;

  // Acuan penilaian (Set Akreditasi) yang dipakai dokumen ini -- lihat
  // accreditation-set.entity.ts. Tidak divalidasi ada/tidaknya di sini
  // (beda tenant dari CreateDokumenLedDto's studyProgram check) karena
  // frontend hanya menawarkan set berstatus SIAP milik tenant sendiri
  // lewat accreditationSetRepository.findSelectable().
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  accreditationSetId?: string;

  // LKPS dokumen ini (Evidence .xlsx/.xls milik prodinya) -- diindeks ke apps/ai /upload/lkps.
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  lkpsEvidenceId?: string;
}
