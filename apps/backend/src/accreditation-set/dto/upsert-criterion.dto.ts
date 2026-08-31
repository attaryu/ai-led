import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { RubricScoreType } from '@ai-led/db';

// levels/chapterOrders sengaja bukan class ternested (@ValidateNested) -- pola
// yang sama sudah dipakai di seluruh apps/backend/src/**/dto (tidak ada satu
// pun yang pakai ValidateNested), isinya cukup divalidasi sebagai array polos.
export class CriterionLevelInput {
  @IsInt()
  @Min(0)
  score!: number;

  @IsString()
  @IsNotEmpty()
  description!: string;
}

export class UpsertCriterionDto {
  @IsInt()
  @Min(1)
  indicatorNo!: number;

  @IsString()
  @IsNotEmpty()
  criterionCode!: string;

  @IsString()
  @IsNotEmpty()
  criterionGroup!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(RubricScoreType)
  scoreType!: RubricScoreType;

  @IsArray()
  @IsString({ each: true })
  lkpsTableRefs!: string[];

  // Non-null hanya untuk scoreType KUANTITATIF/KOMPOSIT -- lihat matrix_parser.py::IndicatorRubric.
  @IsOptional()
  @IsString()
  formula?: string | null;

  @IsOptional()
  @IsString()
  subScoreFormula?: string | null;

  @IsArray()
  levels!: CriterionLevelInput[];

  @IsArray()
  @IsInt({ each: true })
  chapterOrders!: number[];
}
