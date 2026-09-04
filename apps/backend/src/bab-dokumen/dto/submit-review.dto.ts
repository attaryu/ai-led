import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

// Omit (or true) submits for review; false cancels the submitter's own
// pending submission ("Batalkan Pengajuan").
export class SubmitReviewDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  diajukan?: boolean;
}
