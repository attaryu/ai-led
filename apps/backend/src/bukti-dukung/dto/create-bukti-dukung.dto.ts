import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { OwnerTipe } from '@ai-led/db';

export class CreateBuktiDukungDto {
  @IsEnum(OwnerTipe)
  ownerType!: OwnerTipe;

  // Required iff ownerType = PROGRAM_STUDI — validated in the service, depends on ownerType.
  @IsOptional()
  @IsString()
  studyProgramId?: string;

  // Display name shown to the user; defaults to the original filename if empty.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentName?: string;

  // R2 object key from POST /storage/presigned-upload — size/type are re-read from R2 in the service, not trusted here.
  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  // `undefined`/`null` = root of the target scope. Verified against ownerType/studyProgramId in the service.
  @IsOptional()
  @IsString()
  folderId?: string | null;
}
