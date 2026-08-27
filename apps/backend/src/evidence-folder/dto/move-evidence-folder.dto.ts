import { IsOptional, IsString } from 'class-validator';

export class MoveEvidenceFolderDto {
  // `null`/omitted = move to the root of the folder's own scope.
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
