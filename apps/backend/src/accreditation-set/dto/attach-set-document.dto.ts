import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// fileKey dari POST /storage/presigned-upload -- sama persis pola bukti-dukung
// (BuktiDukungService.create), ukuran/tipe dibaca ulang dari R2, bukan dipercaya dari body.
export class AttachSetDocumentDto {
  @ApiProperty({ example: 'uploads/2026/rubrik-akreditasi.pdf' })
  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  @ApiProperty({ example: 'Rubrik Akreditasi 2026' })
  @IsString()
  @IsNotEmpty()
  title!: string;
}
