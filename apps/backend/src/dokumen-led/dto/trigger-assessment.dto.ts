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

  // Descriptive only — recorded on assessment_sessions, doesn't change how the agent retrieves evidence.
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
}
