import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class UpsertVerdictDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  indicatorNo!: number;

  @ApiProperty({ example: 3.5 })
  @IsNumber()
  @Min(0)
  finalScore!: number;

  // Wajib diisi FE saat mengoreksi angka mesin, opsional saat menyetujui apa
  // adanya — aturan itu ditegakkan di frontend (assessment-verdict.entity.ts),
  // bukan di sini, supaya pesan validasinya bisa menjelaskan bedanya.
  @ApiPropertyOptional({ example: 'Dikoreksi karena bukti dukung kurang lengkap' })
  @IsOptional()
  @IsString()
  note?: string;
}
