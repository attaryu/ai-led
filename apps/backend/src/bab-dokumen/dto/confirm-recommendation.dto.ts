import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class ConfirmRecommendationDto {
  @ApiProperty({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsString()
  recommendationId!: string;

  @ApiProperty({ example: ['clx1a2b3c4d5e6f7g8h9i0j1'] })
  @IsArray()
  @IsString({ each: true })
  selectedEvidenceIds!: string[];
}
