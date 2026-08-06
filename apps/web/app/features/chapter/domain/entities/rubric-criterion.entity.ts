import { z } from 'zod';

/**
 * Satu kriteria penilaian LAM Teknik (docs/database.md → `RUBRIK_KRITERIA`),
 * beserta nomor bab yang dinilainya (`RUBRIK_KRITERIA_BAB`).
 *
 * **Master data global.** Ia sama untuk semua tenant, di-seed sekali, dan tidak
 * pernah disunting lewat UI oleh siapa pun. Karena itu ia hidup sebagai konstanta
 * modul di berkas ini, bukan repository localStorage seperti entitas lain —
 * sejajar dengan `CHAPTER_TEMPLATE`. Menyimpannya di penyimpanan yang bisa ditulis
 * hanya menambah satu jalur lagi yang bisa rusak, tanpa satu pun penulis.
 *
 * `RUBRIK_KRITERIA_BAB` didenormalisasi jadi {@link RubricCriterion.urutanBab},
 * dengan alasan yang sama seperti denormalisasi lain di fitur ini: sumbernya masih
 * di dalam kode, dan saat pindah ke API ia kembali jadi tabel relasi. Yang
 * dicocokkan tetap **nomor bab**, bukan id bab — docs/database.md §11 menegaskan
 * `urutan_bab` di sana memang bukan foreign key.
 */
export const rubricLevelSchema = z.object({
	/** Nilai level, menaik dari 1. */
	skor: z.number().int().positive(),
	/** Bunyi level: apa yang harus dipenuhi isi bab untuk mendapat skor ini. */
	deskripsi: z.string(),
});

export type RubricLevel = z.infer<typeof rubricLevelSchema>;

export const rubricCriterionSchema = z.object({
	id: z.string(),
	/** Kode sesuai rubrik asli, misal "C1" atau "4.1a". */
	kodeKriteria: z.string(),
	/** Bunyi kriteria/pertanyaan penilaiannya. */
	deskripsi: z.string(),
	/**
	 * Penjelasan tiap level skor.
	 *
	 * **Kolom ini belum ada di docs/database.md §10**, yang baru menyebut
	 * `kode_kriteria`, `deskripsi`, dan `skor_maksimal`. Padahal
	 * docs/application_flow.md §9.1 menuntut tab Rubrik menampilkan "deskripsi
	 * tiap level skor" — tanpa data ini, penyusun cuma melihat angka tanpa tahu
	 * apa yang membedakan skor 2 dari skor 3. Celahnya dicatat di database.md,
	 * bukan ditambahkan diam-diam.
	 */
	levelSkor: z.array(rubricLevelSchema).min(1),
	/** Nomor bab standar yang dinilai kriteria ini (`RUBRIK_KRITERIA_BAB`). */
	urutanBab: z.array(z.number().int().positive()),
});

export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

/**
 * Skor tertinggi yang mungkin didapat.
 *
 * **Diturunkan, tidak disimpan**, walau docs/database.md §10 menuliskannya sebagai
 * kolom `skor_maksimal`. Alasannya aturan yang sudah ditegakkan proyek ini di
 * `chapter.entity.ts` untuk status bab: kolom yang bisa dihitung dari fakta yang
 * sudah ada akan jadi state kedua yang bisa tidak sinkron — di sini, `skor_maksimal
 * = 5` pada kriteria yang cuma punya empat level adalah kesalahan yang tidak akan
 * pernah tertangkap. Semua kriteria contoh memakai skala 1–4, tapi bentuk ini tidak
 * mengunci skala itu.
 */
export function skorMaksimal(kriteria: RubricCriterion): number {
	return kriteria.levelSkor.reduce(
		(tertinggi, level) => Math.max(tertinggi, level.skor),
		0,
	);
}

/** Level yang cocok dengan skor yang didapat; `undefined` bila di luar daftar. */
export function levelUntukSkor(
	kriteria: RubricCriterion,
	skor: number,
): RubricLevel | undefined {
	return kriteria.levelSkor.find((level) => level.skor === skor);
}

/**
 * Empat level yang dipakai seluruh kriteria contoh. Bunyinya sengaja generik —
 * rubrik LAM Teknik yang sebenarnya belum tersedia, dan mengarang bunyi resmi
 * per kriteria akan terbaca seolah data ini sudah final.
 */
function levelStandar(pokok: string): RubricLevel[] {
	return [
		{
			skor: 1,
			deskripsi: `Tidak ada uraian tentang ${pokok}, atau uraiannya tidak relevan dengan kriteria.`,
		},
		{
			skor: 2,
			deskripsi: `Ada uraian tentang ${pokok}, tapi masih umum dan tidak didukung data atau bukti dukung.`,
		},
		{
			skor: 3,
			deskripsi: `Uraian ${pokok} lengkap dan didukung bukti dukung, namun analisisnya belum menunjukkan tindak lanjut.`,
		},
		{
			skor: 4,
			deskripsi: `Uraian ${pokok} lengkap, didukung bukti dukung, dianalisis, dan disertai rencana tindak lanjut yang terukur.`,
		},
	];
}

/**
 * Kriteria contoh.
 *
 * Sengaja **tidak** menutup seluruh 14 bab: docs/database.md §10 menyatakan bab
 * yang tidak punya baris `RUBRIK_KRITERIA_BAB` otomatis tidak punya hasil skor,
 * dan keadaan itu perlu bisa dilihat tanpa menyiapkan data sendiri.
 */
export const RUBRIK_KRITERIA: RubricCriterion[] = [
	{
		id: 'rk-01',
		kodeKriteria: 'C1',
		deskripsi:
			'Kejelasan visi, misi, tujuan, dan strategi unit pengelola program studi.',
		levelSkor: levelStandar('visi, misi, tujuan, dan strategi'),
		urutanBab: [1, 2],
	},
	{
		id: 'rk-02',
		kodeKriteria: 'C2',
		deskripsi:
			'Keterlibatan pemangku kepentingan dalam penyusunan dan sosialisasi visi misi.',
		levelSkor: levelStandar('keterlibatan pemangku kepentingan'),
		urutanBab: [1],
	},
	{
		id: 'rk-03',
		kodeKriteria: 'C3',
		deskripsi:
			'Ketersediaan dokumen formal tata pamong dan sistem penjaminan mutu internal.',
		levelSkor: levelStandar('tata pamong dan penjaminan mutu internal'),
		urutanBab: [2, 4],
	},
	{
		id: 'rk-04',
		kodeKriteria: 'C4',
		deskripsi:
			'Kecukupan dan kualifikasi sumber daya manusia yang mendukung program studi.',
		levelSkor: levelStandar('kecukupan dan kualifikasi sumber daya manusia'),
		urutanBab: [4, 5],
	},
	{
		id: 'rk-05',
		kodeKriteria: 'C5',
		deskripsi:
			'Relevansi kurikulum terhadap capaian pembelajaran dan kebutuhan pemangku kepentingan.',
		levelSkor: levelStandar('relevansi kurikulum'),
		urutanBab: [5],
	},
	{
		id: 'rk-06',
		kodeKriteria: 'C6',
		deskripsi:
			'Capaian luaran tridarma: publikasi, pengabdian, dan prestasi mahasiswa.',
		levelSkor: levelStandar('capaian luaran tridarma'),
		urutanBab: [6, 10],
	},
];

/**
 * Kriteria yang dinilai untuk satu nomor bab, terurut `kodeKriteria`.
 *
 * Larik kosong berarti bab itu memang tidak dinilai rubrik — bukan kegagalan
 * pemuatan, dan tampilannya harus menyatakan itu.
 */
export function findKriteriaForBab(urutanBab: number): RubricCriterion[] {
	return RUBRIK_KRITERIA.filter((kriteria) =>
		kriteria.urutanBab.includes(urutanBab),
	).sort((a, b) => a.kodeKriteria.localeCompare(b.kodeKriteria));
}
