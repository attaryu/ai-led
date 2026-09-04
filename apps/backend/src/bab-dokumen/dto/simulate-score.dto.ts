import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Omit chapterDraftId to simulate the chapter's active (aktif) content. */
export class SimulateScoreDto {
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  chapterDraftId?: string;
}
