import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class UpsertVerdictDto {
  @IsInt()
  @IsPositive()
  indikatorNo!: number;

  @IsNumber()
  @Min(0)
  skorFinal!: number;

  // Wajib diisi FE saat mengoreksi angka mesin, opsional saat menyetujui apa
  // adanya — aturan itu ditegakkan di frontend (assessment-verdict.entity.ts),
  // bukan di sini, supaya pesan validasinya bisa menjelaskan bedanya.
  @IsOptional()
  @IsString()
  catatan?: string;
}
