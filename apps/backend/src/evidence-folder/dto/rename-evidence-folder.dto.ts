import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameEvidenceFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
