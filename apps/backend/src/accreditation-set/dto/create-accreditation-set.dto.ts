import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateAccreditationSetDto {
  @IsString()
  @IsNotEmpty()
  nama!: string;

  @IsString()
  @IsNotEmpty()
  lembaga!: string;

  // Selalu dibuat DRAF (lihat AccreditationSetService.create) -- tahun siklus akreditasi, bukan tahun akademik.
  @IsInt()
  @Min(2000)
  @Max(2100)
  tahunSiklus!: number;
}
