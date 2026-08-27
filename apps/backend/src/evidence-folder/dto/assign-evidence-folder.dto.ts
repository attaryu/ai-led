import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class AssignEvidenceFolderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  evidenceIds!: string[];

  // `null`/omitted = move to the root of the caller's scope.
  @IsOptional()
  @IsString()
  folderId?: string | null;
}
