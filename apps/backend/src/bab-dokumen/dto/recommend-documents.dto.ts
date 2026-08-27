import { IsOptional, IsString } from 'class-validator';

export class RecommendDocumentsDto {
  // Set for "Rekomendasikan Ulang" — reuses the existing empty draft instead of creating a new one.
  @IsOptional()
  @IsString()
  draftId?: string;
}
