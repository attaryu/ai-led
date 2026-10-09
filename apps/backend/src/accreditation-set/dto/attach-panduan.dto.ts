import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// Mode "pilih existing" -- pasang Panduan yang sudah pernah diunggah (oleh
// Set manapun) ke Set ini, tanpa upload/ekstraksi ulang.
export class AttachPanduanDto {
  @ApiProperty({ example: 'clx1a2b3c4' })
  @IsString()
  @IsNotEmpty()
  panduanId!: string;
}
