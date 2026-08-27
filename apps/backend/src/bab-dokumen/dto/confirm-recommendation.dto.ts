import { IsArray, IsString } from 'class-validator';

export class ConfirmRecommendationDto {
  @IsString()
  recommendationId!: string;

  @IsArray()
  @IsString({ each: true })
  selectedEvidenceIds!: string[];
}
