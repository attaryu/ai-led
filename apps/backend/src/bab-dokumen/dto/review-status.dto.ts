import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// PENJAMIN_MUTU-only actions: lock/unlock and/or write a review note.
// Either action clears reviewSubmittedAt (docs/database.md §5).
export class ReviewStatusDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional({ example: 'Sudah sesuai, lanjutkan ke bab berikutnya' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  qualityAssuranceNote?: string | null;
}
