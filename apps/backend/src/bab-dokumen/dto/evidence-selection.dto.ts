import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

/** PUT bab/:id/sections/:sectionId/evidence-selection -- daftar LENGKAP yang dicentang (replace, bukan tambah). */
export class EvidenceSelectionDto {
  @ApiProperty({ example: ['clx1a2b3c4d5e6f7g8h9i0j1'] })
  @IsArray()
  @IsString({ each: true })
  evidenceIds!: string[];
}
