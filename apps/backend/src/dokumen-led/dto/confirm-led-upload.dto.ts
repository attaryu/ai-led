import { IsNotEmpty, IsString } from 'class-validator';

/** `key` from POST /storage/presigned-upload, after the browser PUT to R2 finished. */
export class ConfirmLedUploadDto {
  @IsString()
  @IsNotEmpty()
  fileKey!: string;
}
