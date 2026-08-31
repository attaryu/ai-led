import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { RubricScoreType } from '@ai-led/db';

// levels/chapterOrders sengaja bukan class ternested (@ValidateNested) -- pola
// yang sama sudah dipakai di seluruh apps/backend/src/**/dto (tidak ada satu
// pun yang pakai ValidateNested), isinya cukup divalidasi sebagai array polos.
export class CriterionLevelInput {
  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(0)
  score!: number;

  @ApiProperty({ example: 'Seluruh dokumen tersedia dan lengkap' })
  @IsString()
  @IsNotEmpty()
  description!: string;
}

export class UpsertCriterionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  indicatorNo!: number;

  @ApiProperty({ example: 'C.4.1' })
  @IsString()
  @IsNotEmpty()
  criterionCode!: string;

  @ApiProperty({ example: 'Tata Pamong dan Kerja Sama' })
  @IsString()
  @IsNotEmpty()
  criterionGroup!: string;

  @ApiProperty({ example: 'Ketersediaan dokumen formal tata pamong' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ enum: RubricScoreType })
  @IsEnum(RubricScoreType)
  scoreType!: RubricScoreType;

  @ApiProperty({ example: ['Tabel 4.1', 'Tabel 4.2'] })
  @IsArray()
  @IsString({ each: true })
  lkpsTableRefs!: string[];

  // Non-null hanya untuk scoreType KUANTITATIF/KOMPOSIT -- lihat matrix_parser.py::IndicatorRubric.
  @ApiPropertyOptional({ example: '(A/B)*100' })
  @IsOptional()
  @IsString()
  formula?: string | null;

  @ApiPropertyOptional({ example: '(A/B)*100' })
  @IsOptional()
  @IsString()
  subScoreFormula?: string | null;

  @ApiProperty({ type: [CriterionLevelInput] })
  @IsArray()
  levels!: CriterionLevelInput[];

  @ApiProperty({ example: [4] })
  @IsArray()
  @IsInt({ each: true })
  chapterOrders!: number[];
}
