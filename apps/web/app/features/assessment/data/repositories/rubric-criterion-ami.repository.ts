import {
	type RubricCriterion,
	type RubricScoreType,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';
import {
	assessmentRemoteSource,
	type AssessmentIndicator,
} from '../sources/remote/assessment.remote-source';

/**
 * Kriteria rubrik AMI **asli** — 64 indikator matriks LAM Teknik sungguhan
 * (`apps/ai/data/rubric_cache/matrix.json`, hasil `POST /upload/matrix`),
 * bukan `RUBRIK_KRITERIA` di `rubric-criterion.entity.ts` yang sample/placeholder.
 *
 * **Kenapa berkas terpisah, bukan menimpa `RUBRIK_KRITERIA`.** Editor Bab
 * (panel panduan penulisan, `guidance-point.entity.ts`) masih bergantung pada
 * `RUBRIK_KRITERIA`/`findKriteriaForBab` yang sinkron dan berisi tulisan
 * panduan hasil karang tangan per bab — mengganti isinya di sini akan
 * mematahkan itu tanpa menggantinya. Dua daftar terpisah untuk sementara,
 * yang satu ini dipakai Penilaian AMI (kesiapan + tabel hasil + ringkasan
 * bab), sampai panel panduan ikut ditulis ulang.
 *
 * **`urutanBab`: indikator 1–61 → bab 2, indikator 62–64 → bab 3.** Diverifikasi
 * dari `led_bab_tabel.json` (struktur LED PJJ Teknik Telekomunikasi asli) lewat
 * field `bab` tiap heading, bukan sekadar urutan tampil: bagian C "Kriteria
 * Akreditasi" (C.1–C.7, indikator 1–61) ternyata anak BAB II "Struktur Laporan
 * Evaluasi Diri" (hal. 14–161), bukan BAB III. BAB III "Program Pengembangan
 * Berkelanjutan" sendiri cuma 10 halaman (162–172) berisi tiga indikator
 * penutup: Analisis SWOT (62), Tujuan Strategi Pengembangan (63), Program
 * Pengembangan Berkelanjutan (64) — namanya cocok persis judul babnya.
 * Tidak ada satu pun indikator yang menyentuh BAB I/IV.
 *
 * **`kodeKriteria` kosong.** Sumbernya (PDF matriks penilaian) tidak
 * mengelompokkan indikator dengan kode singkat semacam "C1" — hanya nama
 * kelompok penuh (`IndicatorRubric.kriteria`). Komponen yang menampilkannya
 * sudah disesuaikan menyembunyikan badge kosong, bukan menampilkan string
 * kosong.
 */

const SCORE_TYPE_MAP: Record<AssessmentIndicator['score_type'], RubricScoreType> = {
	qualitative: 'kualitatif',
	quantitative: 'kuantitatif',
	composite: 'komposit',
};

function toRubricCriterion(indikator: AssessmentIndicator): RubricCriterion {
	return {
		id: `ami-${indikator.no}`,
		no: indikator.no,
		kodeKriteria: '',
		kriteria: indikator.kriteria,
		deskripsi: indikator.indikator,
		tipeSkor: SCORE_TYPE_MAP[indikator.score_type],
		tabelLkps: indikator.lkps_table_ref,
		levelSkor: Object.entries(indikator.score_criteria)
			.map(([skor, deskripsi]) => ({ skor: Number(skor), deskripsi }))
			.sort((a, b) => a.skor - b.skor),
		urutanBab: [indikator.no <= 61 ? 2 : 3],
	};
}

/**
 * Dipanggil ulang tiap kali (tidak di-cache modul) — sama seperti pola fetch
 * lain di fitur ini (`findAll`, `findById`, dst di `assessment-session.repository.ts`).
 * `/assessment/indicators` ringan (64 baris kecil), jadi mengulang requestnya
 * tidak sepadan dengan kerumitan lapisan cache tambahan.
 */
export const rubricCriterionAmiRepository = {
	async findAll(): Promise<RubricCriterion[]> {
		const indikator = await assessmentRemoteSource.findIndicators();
		return indikator.map(toRubricCriterion).sort((a, b) => a.no - b.no);
	},
};
