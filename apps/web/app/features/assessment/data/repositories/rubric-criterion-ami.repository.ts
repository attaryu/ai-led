import { type RubricCriterion } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { accreditationSetRepository } from '~/features/accreditation-set/data/repositories/accreditation-set.repository';

/**
 * Kriteria rubrik AMI **asli** — kriteria Set Akreditasi yang benar-benar
 * dipilih dokumen/proyek ini, bukan `RUBRIK_KRITERIA` di
 * `rubric-criterion.entity.ts` yang sample/placeholder.
 *
 * Dulu (sebelum fitur Set Akreditasi) ini baca `GET /assessment/indicators`
 * (`apps/ai`, matrix.json 64 indikator LAM Teknik global) — sekarang setiap
 * dokumen bisa punya rubriknya sendiri, jadi sumbernya wajib
 * `accreditationSetId` (dari `LedProjectEntity.accreditationSetId`), bukan
 * lagi satu daftar global. `accreditation-set.repository.ts::findById` sudah
 * mengembalikan `kriteria` dalam bentuk `RubricCriterion[]` yang sama persis
 * — tidak perlu mapping tambahan.
 *
 * `GET /assessment/indicators` TETAP dipertahankan apa adanya di tempat lain
 * (`apps/ai`) sebagai sumber bootstrap `seed-rubric-criteria.ts` — bukan
 * jalur ini.
 */
export const rubricCriterionAmiRepository = {
	/**
	 * `undefined`/`null` `accreditationSetId` (dokumen belum memilih Set
	 * Akreditasi) mengembalikan array kosong — bukan error — supaya kesiapan/
	 * hasil/ringkasan AMI tetap tampil dengan wajar (kosong), bukan 500/crash.
	 */
	async findAll(accreditationSetId: string | null | undefined): Promise<RubricCriterion[]> {
		if (!accreditationSetId) return [];
		const set = await accreditationSetRepository.findById(accreditationSetId);
		return [...(set?.kriteria ?? [])].sort((a, b) => a.no - b.no);
	},
};
