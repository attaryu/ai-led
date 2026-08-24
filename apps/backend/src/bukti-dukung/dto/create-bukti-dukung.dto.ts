import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { OwnerTipe } from '@ai-led/db';

export class CreateBuktiDukungDto {
  @IsEnum(OwnerTipe)
  ownerTipe!: OwnerTipe;

  // Required iff ownerTipe = PROGRAM_STUDI — validated in the service, depends on ownerTipe.
  @IsOptional()
  @IsString()
  studyProgramId?: string;

  // Display name shown to the user; defaults to the original filename if empty.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  namaDokumen?: string;

  // R2 object key from POST /storage/presigned-upload — size/type are re-read from R2 in the service, not trusted here.
  @IsString()
  @IsNotEmpty()
  fileKey!: string;
}
