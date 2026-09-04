import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** `key` from POST /storage/presigned-upload, after the browser PUT to R2 finished. */
export class ConfirmLedUploadDto {
  @ApiProperty({ example: 'uploads/2026/led-teknik-informatika.pdf' })
  @IsString()
  @IsNotEmpty()
  fileKey!: string;
}
