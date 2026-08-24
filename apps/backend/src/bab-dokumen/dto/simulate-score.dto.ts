import { IsOptional, IsString } from 'class-validator';

/** Omit chapterDraftId to simulate the chapter's active (aktif) content. */
export class SimulateScoreDto {
  @IsOptional()
  @IsString()
  chapterDraftId?: string;
}
