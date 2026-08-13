import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// PENJAMIN_MUTU-only actions: lock/unlock and/or write a review note.
// Either action clears diajukanReviewPada (docs/database.md §5).
export class ReviewStatusDto {
  @IsOptional()
  @IsBoolean()
  terkunci?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  catatanPenjaminMutu?: string | null;
}
