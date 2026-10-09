import { z } from 'zod';

/**
 * Satu indikator penilaian LAM Teknik (docs/database.md → `RUBRIK_KRITERIA`),
 * beserta nomor bab yang dinilainya (`RUBRIK_KRITERIA_BAB`).
 *
 * **Master data global.** Ia sama untuk semua tenant, di-seed sekali, dan tidak
 * pernah disunting lewat UI oleh siapa pun. Karena itu ia hidup sebagai konstanta
 * modul di berkas ini, bukan repository localStorage seperti entitas lain —
 * sejajar dengan `CHAPTER_TEMPLATE`. Menyimpannya di penyimpanan yang bisa ditulis
 * hanya menambah satu jalur lagi yang bisa rusak, tanpa satu pun penulis.
 *
 * Padanan sisi Prisma-nya `PanduanReferensi` bertipe `DOKUMEN_RUBRIK`, yang
 * memang **tidak punya `tenantId`** — bukti bahwa matriks penilaian di-seed
 * sekali, bukan diunggah tiap kali penilaian dijalankan. Itulah alasan kartu
 * "Upload Matriks Penilaian" di prototipe AMI tidak ikut dibawa ke sini.
 *
 * **Dipakai dua permukaan sekaligus**, dan sengaja tetap satu daftar:
 *
 * - Penilaian AMI menilai **seluruh** indikator terhadap satu Dokumen LED.
 * - Editor Bab menyaringnya lewat {@link findKriteriaForBab} untuk menampilkan
 *   skor AMI bab yang sedang ditulis, di tab Review.
 *
 * Dua daftar sendiri-sendiri pasti akan berbeda isinya suatu saat, dan angka di
 * dua layar itu akan berhenti bisa dibandingkan.
 *
 * `RUBRIK_KRITERIA_BAB` didenormalisasi jadi {@link RubricCriterion.urutanBab},
 * dengan alasan yang sama seperti denormalisasi lain di fitur ini: sumbernya masih
 * di dalam kode, dan saat pindah ke API ia kembali jadi tabel relasi. Yang
 * dicocokkan tetap **nomor bab**, bukan id bab — docs/database.md §11 menegaskan
 * `urutan_bab` di sana memang bukan foreign key.
 */
export const rubricLevelSchema = z.object({
	/** Nilai level, 0–4 mengikuti skala matriks LAM. */
	skor: z.number().int().nonnegative(),
	/** Bunyi level: apa yang harus dipenuhi isi bab untuk mendapat skor ini. */
	deskripsi: z.string(),
});

export type RubricLevel = z.infer<typeof rubricLevelSchema>;

/**
 * Cara sebuah indikator dinilai, mengikuti `IndicatorRubric.score_type` di
 * `apps/ai/ingestion/matrix_parser.py`.
 *
 * Bedanya nyata, bukan label: indikator `kuantitatif` dihitung dari rumus atas
 * tabel LKPS dan tidak bergantung pada tulisan LED sama sekali, sedangkan
 * `kualitatif` justru sebaliknya. `komposit` menggabungkan keduanya. Itulah yang
 * membuat sebuah dokumen bisa lengkap tapi tetap berskor rendah — dan pembaca
 * berhak tahu indikator mana yang tidak akan membaik dengan menulis lebih banyak.
 */
export const rubricScoreTypeEnum = z.enum([
	'kualitatif',
	'kuantitatif',
	'komposit',
]);
export type RubricScoreType = z.infer<typeof rubricScoreTypeEnum>;

export const rubricScoreTypeLabels: Record<RubricScoreType, string> = {
	kualitatif: 'Kualitatif',
	kuantitatif: 'Kuantitatif',
	komposit: 'Komposit',
};

export const rubricCriterionSchema = z.object({
	id: z.string(),
	/**
	 * Nomor urut indikator di matriks penilaian, dipakai sebagai kunci hasil AMI
	 * (`IndicatorResult.indicatorNo`) dan sebagai nomor baris di tabel hasil.
	 *
	 * Terpisah dari {@link RubricCriterion.kodeKriteria}: kode mengelompokkan
	 * ("C1" bisa memayungi beberapa indikator), nomor mengidentifikasi.
	 */
	no: z.number().int().positive(),
	/**
	 * Sub-indikator ("I", "II", ...) bila satu nomor punya beberapa baris rubrik (43.I / 43.II); `""` = tanpa sub.
	 * Bersama `no` ini kunci baris -- nomor saja tidak unik.
	 */
	subNo: z.string().optional(),
	/** Kode sesuai rubrik asli, misal "C1" atau "4.1a". */
	kodeKriteria: z.string(),
	/** Nama kelompok kriteria yang memayungi indikator ini, untuk pengelompokan. */
	kriteria: z.string(),
	/** Bunyi kriteria/pertanyaan penilaiannya. */
	deskripsi: z.string(),
	tipeSkor: rubricScoreTypeEnum,
	/**
	 * Tabel LKPS yang jadi sumber angkanya (`IndicatorRubric.lkps_table_ref`).
	 * Kosong untuk indikator murni kualitatif — dan kosongnya bermakna: ia
	 * menyatakan indikator ini dinilai sepenuhnya dari narasi LED.
	 */
	tabelLkps: z.array(z.string()),
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
	/**
	 * Rumus penghitung skor dari angka tabel LKPS, mis. `"BOP / 5000000"`.
	 * Berlaku hanya untuk `tipeSkor` `kuantitatif`/`komposit` -- `null` untuk
	 * kualitatif, dan `undefined` untuk baris lama (seed contoh) yang lahir
	 * sebelum kolom ini ada. Bentuknya dari
	 * `apps/ai/ingestion/matrix_parser.py::IndicatorRubric.formula`.
	 */
	formula: z.string().nullable().optional(),
	/** Rumus gabungan sub-skor komposit, mis. `"((I x 2) + II) / 3"`. Sama syaratnya dengan `formula`. */
	subScoreFormula: z.string().nullable().optional(),
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
 * pernah tertangkap. Semua kriteria contoh memakai skala 0–4, tapi bentuk ini tidak
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
 * Lima level yang dipakai seluruh indikator contoh. Bunyinya sengaja generik —
 * rubrik LAM Teknik yang sebenarnya belum tersedia (sumber aslinya
 * `apps/ai/data/penilaian_10_rubrik_sarjana_terapan.csv`), dan mengarang bunyi
 * resmi per indikator akan terbaca seolah data ini sudah final.
 *
 * Skala **0–4**, bukan 1–4 seperti versi pertama berkas ini. `matrix_parser.py`
 * membaca `score_criteria` sebagai `{4, 3, 2, 1, 0}`, dan level 0 bukan sekadar
 * pelengkap: ia satu-satunya cara membedakan "tidak ditulis sama sekali" dari
 * "ditulis tapi tidak menjawab kriteria" — dua keadaan dengan tindak lanjut yang
 * sama sekali berbeda.
 */
function levelStandar(pokok: string): RubricLevel[] {
	return [
		{
			skor: 0,
			deskripsi: `Tidak ada uraian tentang ${pokok} sama sekali di dokumen.`,
		},
		{
			// Kalimatnya sengaja tidak dibuka dengan `${pokok}`: pokoknya selalu
			// huruf kecil, dan kalimat yang dimulai dengannya terbaca seperti potongan
			// yang terpenggal.
			skor: 1,
			deskripsi: `Ada penyebutan ${pokok}, tapi uraiannya tidak menjawab yang ditanyakan kriteria ini.`,
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
 * Indikator contoh.
 *
 * Sengaja **tidak** menutup seluruh 14 bab: docs/database.md §10 menyatakan bab
 * yang tidak punya baris `RUBRIK_KRITERIA_BAB` memang tidak dinilai rubrik, dan
 * keadaan itu perlu bisa dilihat tanpa menyiapkan data sendiri. Bab 1, 2, dan 14
 * dibiarkan kosong.
 *
 * Jumlahnya belasan, bukan 78 seperti matriks sungguhan: 78 baris karangan hanya
 * akan membuat tabel hasil terlihat sudah jadi padahal bunyinya belum satu pun
 * berasal dari LAM. `no` sengaja tidak rapat supaya penambahan indikator asli di
 * sela-selanya nanti tidak memaksa penomoran ulang.
 */
export const RUBRIK_KRITERIA: RubricCriterion[] = [
	{
		id: 'rk-01',
		no: 1,
		kodeKriteria: 'C1',
		kriteria: 'Visi, Misi, Tujuan, dan Strategi',
		deskripsi:
			'Kejelasan visi, misi, tujuan, dan strategi unit pengelola program studi.',
		tipeSkor: 'kualitatif',
		tabelLkps: [],
		levelSkor: levelStandar('visi, misi, tujuan, dan strategi'),
		urutanBab: [4],
	},
	{
		id: 'rk-02',
		no: 2,
		kodeKriteria: 'C1',
		kriteria: 'Visi, Misi, Tujuan, dan Strategi',
		deskripsi:
			'Keterlibatan pemangku kepentingan dalam penyusunan dan sosialisasi visi misi.',
		tipeSkor: 'kualitatif',
		tabelLkps: [],
		levelSkor: levelStandar('keterlibatan pemangku kepentingan'),
		urutanBab: [4],
	},
	{
		id: 'rk-03',
		no: 3,
		kodeKriteria: 'C2',
		kriteria: 'Tata Pamong, Tata Kelola, dan Kerja Sama',
		deskripsi:
			'Ketersediaan dokumen formal tata pamong dan sistem penjaminan mutu internal.',
		tipeSkor: 'kualitatif',
		tabelLkps: [],
		levelSkor: levelStandar('tata pamong dan penjaminan mutu internal'),
		urutanBab: [5],
	},
	{
		id: 'rk-04',
		no: 4,
		kodeKriteria: 'C2',
		kriteria: 'Tata Pamong, Tata Kelola, dan Kerja Sama',
		deskripsi:
			'Jumlah dan mutu kerja sama tridarma yang relevan dengan program studi.',
		tipeSkor: 'komposit',
		tabelLkps: ['Tabel 1. Kerjasama Tridarma'],
		levelSkor: levelStandar('kerja sama tridarma'),
		urutanBab: [5],
	},
	{
		id: 'rk-05',
		no: 5,
		kodeKriteria: 'C3',
		kriteria: 'Mahasiswa',
		deskripsi:
			'Rasio keketatan seleksi dan daya tarik program studi bagi calon mahasiswa.',
		tipeSkor: 'kuantitatif',
		tabelLkps: ['Tabel 2.a. Seleksi Mahasiswa'],
		levelSkor: levelStandar('keketatan seleksi mahasiswa'),
		urutanBab: [6],
	},
	{
		id: 'rk-06',
		no: 6,
		kodeKriteria: 'C3',
		kriteria: 'Mahasiswa',
		deskripsi:
			'Layanan kemahasiswaan dan dukungan pengembangan minat, bakat, serta penalaran.',
		tipeSkor: 'kualitatif',
		tabelLkps: [],
		levelSkor: levelStandar('layanan kemahasiswaan'),
		urutanBab: [6],
	},
	{
		id: 'rk-07',
		no: 7,
		kodeKriteria: 'C4',
		kriteria: 'Sumber Daya Manusia',
		deskripsi:
			'Kecukupan dan kualifikasi dosen tetap yang mendukung program studi.',
		tipeSkor: 'kuantitatif',
		tabelLkps: ['Tabel 3.a.1. Dosen Tetap'],
		levelSkor: levelStandar('kecukupan dan kualifikasi dosen tetap'),
		urutanBab: [7],
	},
	{
		id: 'rk-08',
		no: 8,
		kodeKriteria: 'C4',
		kriteria: 'Sumber Daya Manusia',
		deskripsi:
			'Beban kerja dosen dan rasio dosen terhadap mahasiswa program studi.',
		tipeSkor: 'kuantitatif',
		tabelLkps: ['Tabel 3.a.2. Beban Kerja Dosen'],
		levelSkor: levelStandar('beban kerja dan rasio dosen'),
		urutanBab: [7],
	},
	{
		id: 'rk-09',
		no: 9,
		kodeKriteria: 'C4',
		kriteria: 'Sumber Daya Manusia',
		deskripsi:
			'Pengembangan kompetensi dosen dan tenaga kependidikan secara berkelanjutan.',
		tipeSkor: 'kualitatif',
		tabelLkps: [],
		levelSkor: levelStandar('pengembangan kompetensi SDM'),
		urutanBab: [7],
	},
	{
		id: 'rk-10',
		no: 10,
		kodeKriteria: 'C5',
		kriteria: 'Keuangan, Sarana, dan Prasarana',
		deskripsi:
			'Kecukupan dana operasional pendidikan per mahasiswa per tahun.',
		tipeSkor: 'kuantitatif',
		tabelLkps: ['Tabel 4.a. Penggunaan Dana'],
		levelSkor: levelStandar('kecukupan dana operasional'),
		urutanBab: [8],
	},
	{
		id: 'rk-11',
		no: 11,
		kodeKriteria: 'C5',
		kriteria: 'Keuangan, Sarana, dan Prasarana',
		deskripsi:
			'Kecukupan dan aksesibilitas sarana prasarana pendukung pembelajaran.',
		tipeSkor: 'kualitatif',
		tabelLkps: [],
		levelSkor: levelStandar('kecukupan sarana dan prasarana'),
		urutanBab: [8],
	},
	{
		id: 'rk-12',
		no: 12,
		kodeKriteria: 'C6',
		kriteria: 'Pendidikan',
		deskripsi:
			'Relevansi kurikulum terhadap capaian pembelajaran dan kebutuhan pemangku kepentingan.',
		tipeSkor: 'kualitatif',
		tabelLkps: [],
		levelSkor: levelStandar('relevansi kurikulum'),
		urutanBab: [9],
	},
	{
		id: 'rk-13',
		no: 13,
		kodeKriteria: 'C6',
		kriteria: 'Pendidikan',
		deskripsi:
			'Pelaksanaan dan hasil monitoring evaluasi proses pembelajaran.',
		tipeSkor: 'komposit',
		tabelLkps: ['Tabel 5.b. Kepuasan Mahasiswa'],
		levelSkor: levelStandar('monitoring dan evaluasi pembelajaran'),
		urutanBab: [9],
	},
	{
		id: 'rk-14',
		no: 14,
		kodeKriteria: 'C7',
		kriteria: 'Penelitian',
		deskripsi:
			'Jumlah dan relevansi penelitian dosen yang melibatkan mahasiswa.',
		tipeSkor: 'kuantitatif',
		tabelLkps: ['Tabel 6.a. Penelitian Dosen'],
		levelSkor: levelStandar('penelitian dosen dan mahasiswa'),
		urutanBab: [10],
	},
	{
		id: 'rk-15',
		no: 15,
		kodeKriteria: 'C8',
		kriteria: 'Pengabdian kepada Masyarakat',
		deskripsi:
			'Jumlah dan kebermanfaatan pengabdian kepada masyarakat yang dilakukan program studi.',
		tipeSkor: 'kuantitatif',
		tabelLkps: ['Tabel 6.b. PkM Dosen'],
		levelSkor: levelStandar('pengabdian kepada masyarakat'),
		urutanBab: [11],
	},
	{
		id: 'rk-16',
		no: 16,
		kodeKriteria: 'C9',
		kriteria: 'Luaran dan Capaian Tridarma',
		deskripsi:
			'Capaian luaran tridarma: publikasi, sitasi, dan prestasi mahasiswa.',
		tipeSkor: 'komposit',
		tabelLkps: ['Tabel 8.f.1. Publikasi Ilmiah', 'Tabel 8.b. Prestasi Mahasiswa'],
		levelSkor: levelStandar('capaian luaran tridarma'),
		urutanBab: [12],
	},
	{
		id: 'rk-17',
		no: 17,
		kodeKriteria: 'C9',
		kriteria: 'Luaran dan Capaian Tridarma',
		deskripsi:
			'Masa tunggu lulusan mendapatkan pekerjaan pertama dan kesesuaian bidang kerja.',
		tipeSkor: 'kuantitatif',
		tabelLkps: ['Tabel 8.d.1. Masa Tunggu Lulusan'],
		levelSkor: levelStandar('masa tunggu dan kesesuaian kerja lulusan'),
		urutanBab: [12],
	},
	{
		id: 'rk-18',
		no: 18,
		kodeKriteria: 'C9',
		kriteria: 'Luaran dan Capaian Tridarma',
		deskripsi:
			'Ketajaman analisis capaian dan ketepatan program pengembangan yang ditetapkan.',
		tipeSkor: 'kualitatif',
		tabelLkps: [],
		levelSkor: levelStandar('analisis capaian dan program pengembangan'),
		urutanBab: [13],
	},
];

/**
 * Seluruh indikator, terurut nomor. Dipakai Penilaian AMI yang menilai satu
 * Dokumen LED terhadap semuanya sekaligus.
 */
export function findAllKriteria(): RubricCriterion[] {
	return [...RUBRIK_KRITERIA].sort((a, b) => a.no - b.no);
}

/** Satu indikator berdasarkan nomornya; `undefined` bila nomornya tidak dikenal. */
export function findKriteriaByNo(no: number): RubricCriterion | undefined {
	return RUBRIK_KRITERIA.find((kriteria) => kriteria.no === no);
}

/**
 * Kriteria yang dinilai untuk satu nomor bab, terurut nomor indikator.
 *
 * Larik kosong berarti bab itu memang tidak dinilai rubrik — bukan kegagalan
 * pemuatan, dan tampilannya harus menyatakan itu.
 */
export function findKriteriaForBab(urutanBab: number): RubricCriterion[] {
	return RUBRIK_KRITERIA.filter((kriteria) =>
		kriteria.urutanBab.includes(urutanBab),
	).sort((a, b) => a.no - b.no);
}
