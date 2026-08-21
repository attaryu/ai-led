import { IsBoolean, IsOptional } from 'class-validator';

// Omit (or true) submits for review; false cancels the submitter's own
// pending submission ("Batalkan Pengajuan").
export class SubmitReviewDto {
  @IsOptional()
  @IsBoolean()
  diajukan?: boolean;
}
