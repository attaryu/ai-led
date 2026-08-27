import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { OwnerTipe } from '@ai-led/db';

export class CreateEvidenceFolderDto {
  @IsEnum(OwnerTipe)
  ownerType!: OwnerTipe;

  // Required iff ownerType = PROGRAM_STUDI — validated in the service, depends on ownerType.
  @IsOptional()
  @IsString()
  studyProgramId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  // `undefined`/`null` = root of its scope.
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
