import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class GenerateBabDto {
  @ApiPropertyOptional({ example: 'Fokuskan ke capaian akreditasi 3 tahun terakhir' })
  @IsOptional()
  @IsString()
  prompt?: string;

  // Names the recommend-step's empty draft so the pipeline can scope Evidence to its confirmed selection.
  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  draftId?: string;

  // Manual "Bukti Dukung" picker; ignored if `draftId` is set.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedEvidenceIds?: string[];
}
