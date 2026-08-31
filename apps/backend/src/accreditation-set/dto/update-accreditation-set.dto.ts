import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AccreditationSetStatus } from '@ai-led/db';

// Identitas set (nama/lembaga/tahunSiklus) tetap bisa diubah walau set sudah
// dipakai -- deriveSetLock (frontend) mengunci ISI (kriteria/dokumen), bukan
// labelnya. status hanya boleh naik DRAF -> SIAP lewat markReady, bukan di sini
// (butuh cekSyaratSiap) -- lihat AccreditationSetService.update.
export class UpdateAccreditationSetDto {
  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsString()
  lembaga?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  tahunSiklus?: number;

  @IsOptional()
  @IsIn([AccreditationSetStatus.DRAF])
  status?: typeof AccreditationSetStatus.DRAF;
}
