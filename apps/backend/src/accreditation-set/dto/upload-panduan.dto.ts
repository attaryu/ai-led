import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// Mode "Baru" -- upload sebuah Panduan Penulisan BARU (reusable across
// AccreditationSet, lihat panduan-controller.ts). fileKey dari POST
// /storage/presigned-upload, sama pola AttachSetDocumentDto.
export class UploadPanduanDto {
  @ApiProperty({ example: 'uploads/2026/pedoman-led-lam-teknik.pdf' })
  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  @ApiProperty({ example: 'Pedoman Penyusunan LED LAM Teknik 2026' })
  @IsString()
  @IsNotEmpty()
  title!: string;
}
