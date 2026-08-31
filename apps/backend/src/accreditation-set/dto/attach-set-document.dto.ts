import { IsNotEmpty, IsString } from 'class-validator';

// fileKey dari POST /storage/presigned-upload -- sama persis pola bukti-dukung
// (BuktiDukungService.create), ukuran/tipe dibaca ulang dari R2, bukan dipercaya dari body.
export class AttachSetDocumentDto {
  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;
}
