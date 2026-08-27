import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class RemoveEvidenceFolderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}
