import { ApiPropertyOptional } from '@nestjs/swagger';
import { LedSourceMode } from '@ai-led/db';
import { IsArray, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class TriggerAssessmentDto {
  // number, not a code string — matches indicator_no throughout the rest of
  // the system (apps/ai/excel/reader.py's IndicatorRow, Prisma's
  // IndicatorResult/ReasoningStep.indicatorNo). No alphanumeric indicator
  // code scheme exists anywhere else to match against.
  @ApiPropertyOptional({
    description:
      'Daftar nomor indikator yang akan dinilai (opsional; kosong/tidak diisi akan menilai seluruh indikator)',
    example: [1, 2, 5],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  indikatorList?: number[];

  // Deskriptif saja — dicatat di assessment_sessions untuk ditampilkan,
  // tidak mengubah cara agent mengambil bukti (selalu lewat pgvector
  // search_led_evidence, lihat catatan di worker.py::_handle_assessment_ami).
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
