import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { OwnerTipe } from '@ai-led/db';

/** Batch upsert-by-path — server-side port of evidence-folder.repository.ts::ensureFolderPaths. */
export class EnsureFolderPathsDto {
  @IsEnum(OwnerTipe)
  ownerType!: OwnerTipe;

  @IsOptional()
  @IsString()
  studyProgramId?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  // Each entry is one path's segments, e.g. ["Kriteria 4", "SK"]. Segment-level
  // shape is checked in the service, not here — class-validator doesn't do
  // array-of-array element typing cleanly, and this is the only caller.
  @IsArray()
  paths!: string[][];
}
