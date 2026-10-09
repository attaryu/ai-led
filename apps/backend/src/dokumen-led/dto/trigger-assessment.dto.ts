import { ApiPropertyOptional } from '@nestjs/swagger';
import { LedSourceMode } from '@ai-led/db';
import { IsArray, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class TriggerAssessmentDto {
  // number, not a code string — matches indicatorNo everywhere else in the system.
  @ApiPropertyOptional({
    description:
      'Daftar nomor indikator yang akan dinilai (opsional; kosong/tidak diisi akan menilai seluruh indikator)',
    example: [1, 2, 5],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  indikatorList?: number[];

  // Kunci "nomor|sub" (mis. "43|I") baris rubrik yang dinilai; kalau diisi, mengalahkan indikatorList.
  // Sub-indikator (43.I / 43.II) dinilai terpisah, jadi nomor saja tidak cukup untuk memilih salah satunya.
  @ApiPropertyOptional({
    description: 'Daftar kunci "nomor|sub" sub-indikator yang dinilai (opsional; mengalahkan indikatorList)',
    example: ['43|I', '5|I'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subIndikatorList?: string[];

  // EDITOR: the worker indexes the chapters' current text as the LED; UNGGAHAN: the uploaded LED file.
  @ApiPropertyOptional({ enum: LedSourceMode })
  @IsOptional()
  @IsEnum(LedSourceMode)
  sumberLed?: LedSourceMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ledFileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lkpsBuktiDukungId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  laporanBuktiDukungId?: string;

  // Assessor model (ariel: chosen per session); must be one of apps/ai get_available_models().
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;
}
