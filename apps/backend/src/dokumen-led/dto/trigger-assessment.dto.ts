import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional } from 'class-validator';

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
}
