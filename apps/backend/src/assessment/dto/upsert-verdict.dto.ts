import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class UpsertVerdictDto {
  @IsInt()
  @IsPositive()
  indicatorNo!: number;

  @IsNumber()
  @Min(0)
  finalScore!: number;

  // Wajib diisi FE saat mengoreksi angka mesin, opsional saat menyetujui apa
  // adanya — aturan itu ditegakkan di frontend (assessment-verdict.entity.ts),
  // bukan di sini, supaya pesan validasinya bisa menjelaskan bedanya.
  @IsOptional()
  @IsString()
  note?: string;
}
