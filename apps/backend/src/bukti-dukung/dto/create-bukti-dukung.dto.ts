import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { OwnerTipe } from '@ai-led/db';

export class CreateBuktiDukungDto {
  @IsEnum(OwnerTipe)
  ownerTipe!: OwnerTipe;

  // Wajib bila ownerTipe = PROGRAM_STUDI, harus kosong bila TENANT — divalidasi
  // di service (bergantung pada ownerTipe, class-validator saja tidak cukup).
  @IsOptional()
  @IsString()
  programStudiId?: string;

  // Nama arsip yang ditampilkan ke user; default ke nama file asli bila kosong
  // (lihat docs/database.md §7 konvensi "menyimpan nama, bukan hanya id").
  @IsOptional()
  @IsString()
  @MaxLength(255)
  namaDokumen?: string;

  // Kunci objek R2 dari POST /storage/presigned-upload — file-nya sendiri
  // sudah sampai ke R2 langsung dari browser sebelum endpoint ini dipanggil
  // (tracker: Cloudflare R2 Storage Module). Ukuran & tipe dibaca ulang dari
  // R2 lewat HeadObject di service, bukan dipercaya dari body ini.
  @IsString()
  @IsNotEmpty()
  fileKey!: string;
}
