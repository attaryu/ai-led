import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { UpsertCriterionDto } from './upsert-criterion.dto';

// Menimpa SELURUH daftar kriteria satu set sekaligus -- disengaja, bukan
// tambah satu-satu (lihat komentar accreditation-set.repository.ts::updateCriterion
// "Tidak ada pasangan addCriterion" di frontend): isi rubrik turun dari berkas
// yang diunggah sekaligus satu daftar penuh (auto-parse, follow-up round),
// jadi endpoint ini adalah kontrak yang sama dipakai manual untuk sekarang.
export class ReplaceCriteriaDto {
  @ApiProperty({ type: [UpsertCriterionDto] })
  @IsArray()
  criteria!: UpsertCriterionDto[];
}
