import { IsOptional, IsString } from 'class-validator';

/** Omit babDraftId to simulate the chapter's active (aktif) content. */
export class SimulateScoreDto {
  @IsOptional()
  @IsString()
  babDraftId?: string;
}
