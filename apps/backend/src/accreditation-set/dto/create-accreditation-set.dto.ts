import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateAccreditationSetDto {
  @ApiProperty({ example: 'Akreditasi Teknik Informatika 2026' })
  @IsString()
  @IsNotEmpty()
  nama!: string;

  @ApiProperty({ example: 'LAM Teknik' })
  @IsString()
  @IsNotEmpty()
  lembaga!: string;

  // Selalu dibuat DRAF (lihat AccreditationSetService.create) -- tahun siklus akreditasi, bukan tahun akademik.
  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  tahunSiklus!: number;
}
