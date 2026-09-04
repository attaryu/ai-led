import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { OwnerTipe } from '@ai-led/db';

/** Batch upsert-by-path — server-side port of evidence-folder.repository.ts::ensureFolderPaths. */
export class EnsureFolderPathsDto {
  @ApiProperty({ enum: OwnerTipe })
  @IsEnum(OwnerTipe)
  ownerType!: OwnerTipe;

  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  studyProgramId?: string;

  @ApiPropertyOptional({ example: 'clx1a2b3c4d5e6f7g8h9i0j1' })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  // Each entry is one path's segments, e.g. ["Kriteria 4", "SK"]. Segment-level
  // shape is checked in the service, not here — class-validator doesn't do
  // array-of-array element typing cleanly, and this is the only caller.
  @ApiProperty({ example: [['Kriteria 4', 'SK']] })
  @IsArray()
  paths!: string[][];
}
