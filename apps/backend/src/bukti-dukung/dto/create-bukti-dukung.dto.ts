import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
