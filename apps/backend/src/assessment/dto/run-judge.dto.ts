import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional } from 'class-validator';

export class RunJudgeDto {
  // Elemen divalidasi di AssessmentService.runJudge (bukan @ValidateNested): tidak ada DTO lain di
  // apps/backend yang memakai class bersarang, isinya cukup array polos (lihat upsert-criterion.dto.ts).
  @ApiPropertyOptional({
    example: [{ indicatorNo: 7, subNo: '' }],
    description: 'Indikator yang dijudge. Kosong = seluruh sesi (baris yang sudah dijudge dilewati); berisi = hanya itu, selalu dijalankan ulang.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  indicators?: { indicatorNo: number; subNo?: string }[];
}
