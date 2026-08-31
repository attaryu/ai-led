import { rubricCriterionAmiRepository } from '~/features/assessment/data/repositories/rubric-criterion-ami.repository';
import {
	type RubricCriterion,
	type RubricLevel,
	type RubricScoreType,
} from './rubric-criterion.entity';

/**
 * Poin panduan yang dirujuk AI saat menyusun sebuah bab
 * (docs/application_flow.md §11.1b, docs/database.md §13–§15).
 *
 * **Dua kelompok, karena pipeline-nya memang dua.** `generation_runs` menyimpan
 * `pedoman_used` dan `rubric_used` di dua kolom terpisah: yang pertama aturan
 * penulisan (RAG 1), yang kedua bunyi level skor yang jadi acuan penilaian
 * (RAG 2). Menggabungkannya jadi satu daftar akan menyembunyikan perbedaan yang
 * di backend justru dipisahkan.
 *
 * ---
 *
 * ## Apa yang nyata dan apa yang tiruan
 *
 * Ini bagian yang paling perlu dibaca sebelum menyunting berkas ini.
 *
 * - **NYATA — kerangka LED-PS.** `CHAPTER_TEMPLATE` (4 bab) dan pengelompokan
 *   kriteria akreditasi C.1–C.7 diverifikasi dari `led_bab_tabel.json` (struktur
 *   asli LED PJJ Teknik Telekomunikasi, diekstrak dari dokumen contoh) —
 *   lewat field `bab` tiap heading, bukan sekadar urutan tampil.
 * - **NYATA — kriteria Set Akreditasi yang dipilih dokumen ini.** Diambil
 *   langsung dari `rubricCriterionAmiRepository`, yang sekarang membaca Set
 *   Akreditasi dokumen (`accreditation-set.repository.ts`), bukan lagi satu
 *   matriks LAM Teknik global. Bukan kutipan tersalin di sini — diminta
 *   langsung tiap dipanggil, supaya tidak ada dua salinan yang bisa berbeda isi.
 * - **INFERENSI — batas nomor indikator per kelompok C.1–C.7** di
 *   {@link KELOMPOK_KRITERIA}. Matriksnya sendiri tidak membawa pengelompokan
 *   eksplisit per indikator, jadi batasnya diturunkan dari kecocokan nama
 *   indikator dengan judul tiap kelompok (mis. indikator 1–3 semuanya
 *   menyebut VMTS, cocok dengan C.1 "Diferensiasi Misi"). Itu penilaian,
 *   bukan data — beda dari nomor indikatornya sendiri yang nyata.
 * - **TIRUAN — seluruh kalimat kerangka `isiTeks`** di {@link POIN_PEDOMAN}.
 *   Tidak ada satu kalimat pedoman LAM pun di repo ini.
 *
 * Konsekuensinya dinyatakan di layar, bukan didiamkan: kaki panel dan kaki laci
 * sama-sama menyebut bahwa rumusan kalimatnya contoh dan bukan kutipan resmi.
 */
export type TipeSumberPanduan =
	| 'PANDUAN_LAM'
	| 'TEMPLATE_LKPS'
	| 'DOKUMEN_RUBRIK';

/** Dokumen sumber sebuah poin; padanan `PanduanReferensi` (docs/database.md §13). */
export type SumberPanduan = {
	id: string;
	tipe: TipeSumberPanduan;
	judul: string;
	tipeFile: string;
};

/** Nama indikator kinerja utama beserta cara ia dinilai. */
export type ButirIku = { nama: string; tipeSkor: RubricScoreType };

/**
 * Satu poin pedoman siap tampil; padanan `PanduanDetail` (§14) yang sudah
 * digabung dengan dokumen induknya dan dengan `PANDUAN_DETAIL_BAB` (§15).
 *
 * `urutanBab` tidak ikut di sini karena poin yang sampai ke pemanggil memang
 * sudah tersaring untuk satu bab — pola yang sama dipakai `findRubrikDipakaiForBab`.
 */
export type PoinPanduan = {
	id: string;
	sumber: SumberPanduan;
	/** Penomoran struktur LED-PS, mis. `3.2` untuk C.3 poin ke-2. */
	kodePoin: string;
	judulPoin: string;
	isiTeks: string;
	/**
	 * Nama indikator yang dinilai di bawah poin ini. Hanya terisi untuk poin
	 * IKU; kosong di poin lain, dan kosongnya bermakna.
	 */
	iku: ButirIku[];
};

/** Satu indikator rubrik beserta level tertinggi yang dikejar tulisan bab. */
export type ButirRubrikDipakai = {
	kriteria: RubricCriterion;
	/** `rubric_used` didokumentasikan sebagai teks rubrik skor tertinggi. */
	target: RubricLevel;
};

const PANDUAN_LED: SumberPanduan = {
	id: 'panduan-led-lam-teknik',
	tipe: 'PANDUAN_LAM',
	judul: 'Panduan Penyusunan LED LAM Teknik',
	tipeFile: 'pdf',
};

const MATRIKS_PENILAIAN: SumberPanduan = {
	id: 'panduan-matriks-lam-teknik',
	tipe: 'DOKUMEN_RUBRIK',
	judul: 'Matriks Penilaian LAM Teknik',
	tipeFile: 'pdf',
};

/**
 * Kelompok kriteria akreditasi (C.1–C.7), seluruhnya anak BAB II "Struktur
 * Laporan Evaluasi Diri" — lihat catatan `urutanBab` di
 * `rubric-criterion-ami.repository.ts` untuk cara batasnya diverifikasi.
 * `dariNo`/`sampaiNo` inklusif, mengacu ke `RubricCriterion.no`.
 */
const KELOMPOK_KRITERIA: {
	nomor: number;
	judul: string;
	dariNo: number;
	sampaiNo: number;
}[] = [
	{ nomor: 1, judul: 'Diferensiasi Misi (Visi, Misi, Tujuan, dan Strategi)', dariNo: 1, sampaiNo: 3 },
	{ nomor: 2, judul: 'Akuntabilitas', dariNo: 4, sampaiNo: 11 },
	{ nomor: 3, judul: 'Relevansi Pendidikan, Penelitian, dan PkM', dariNo: 12, sampaiNo: 27 },
	{ nomor: 4, judul: 'Sumber Daya Manusia', dariNo: 28, sampaiNo: 42 },
	{
		nomor: 5,
		judul: 'Sarana, Prasarana, dan Keselamatan Kesehatan Kerja dan Lingkungan (K3L)',
		dariNo: 43,
		sampaiNo: 44,
	},
	{ nomor: 6, judul: 'Mahasiswa dan Luaran Mahasiswa', dariNo: 45, sampaiNo: 56 },
	{ nomor: 7, judul: 'Sistem Penjaminan Mutu', dariNo: 57, sampaiNo: 61 },
];

/**
 * Rincian aspek penilaian tingkat tertinggi yang **nyata**, dikutip dari
 * `apps/ai/data/penilaian_10_rubrik_sarjana_terapan.csv`.
 *
 * Cocok lewat `startsWith` karena nama indikator asli kadang membawa ekor
 * rumus PDF (mis. "Sistem tata pamong Skor = ((I x 2)+ (II)) / 3") — lihat
 * {@link bersihkanNamaIndikator}.
 */
const ASPEK_NYATA: Record<string, string> = {
	'Kekhasan VMTS':
		'linearitas visi, kesesuaian renstra, dan kesesuaian visi keilmuan prodi',
	'Sistem tata pamong':
		'statuta, kewenangan efektif, bukti sahih pelaksanaan, dan dampak jangka panjang bagi seluruh pemangku kepentingan',
	'Pengelolaan keuangan':
		'transparansi, kepatuhan regulasi, efisiensi dan efektivitas, pengelolaan risiko, serta audit internal dan eksternal',
};

/**
 * Nama indikator dari `matrix.json` kadang membawa ekor rumus penilaian
 * (parser matriks membaca kolom "Kriteria" dan rumus skalanya sebagai satu
 * baris — lihat `apps/ai/ingestion/matrix_parser.py`). Ekornya berguna di
 * tabel hasil Penilaian AMI (menyatakan cara hitungnya), tapi mengotori
 * kalimat panduan penulisan di sini, jadi dipotong sebelum dipakai.
 */
function bersihkanNamaIndikator(nama: string): string {
	return nama.replace(/\s*Skor\s*=.*/i, '').trim();
}

/**
 * Kerangka lima poin LED-PS beserta kalimat penjelasnya.
 *
 * **Seluruh kalimat di sini tiruan**, dan bunyinya tunduk pada tiga aturan yang
 * tidak boleh dilanggar saat menambah atau menyunting:
 *
 * 1. **Memerikan, bukan mewajibkan.** "Bagian ini biasanya menguraikan…", bukan
 *    "Bagian ini harus memuat…". Kata **wajib**, **harus**, **minimal**, dan
 *    **sekurang-kurangnya** dilarang, begitu pula angka ambang apa pun —
 *    keduanya membuat kalimat karangan terbaca sebagai tuntutan resmi.
 * 2. **Tanpa nomor pasal atau kutipan resmi.** `kodePoin` hanya penomoran
 *    struktur LED-PS; tidak ada rujukan ke peraturan.
 * 3. **Nama indikator dikutip apa adanya** (sesudah {@link bersihkanNamaIndikator}),
 *    tidak diparafrase.
 */
const POIN_PEDOMAN: {
	akhiran: string;
	judulPoin: string;
	isiTeks: (konteks: {
		judulKriteria: string;
		indikator: ButirIku[];
	}) => string;
}[] = [
	{
		akhiran: '1',
		judulPoin: 'Latar Belakang',
		isiTeks: ({ judulKriteria }) =>
			`Bagian ini biasanya menguraikan latar belakang, tujuan, dan rasional pengelolaan ${judulKriteria.toLowerCase()} di unit pengelola dan program studi, beserta mekanisme penetapan kebijakannya.`,
	},
	{
		akhiran: '2',
		judulPoin: 'Kebijakan',
		isiTeks: ({ judulKriteria }) =>
			`Bagian ini biasanya menyebutkan dokumen formal yang menjadi dasar pengelolaan ${judulKriteria.toLowerCase()} — statuta, renstra, peraturan, atau pedoman — beserta bagaimana dokumen itu diterjemahkan jadi praktik sehari-hari.`,
	},
	{
		akhiran: '3',
		judulPoin: 'Indikator Kinerja Utama (IKU)',
		isiTeks: ({ indikator }) => {
			const daftar = indikator
				.map((butir, urutan) => `(${huruf(urutan)}) ${butir.nama}`)
				.join(', ');
			const beraspek = indikator.find((butir) => ASPEK_NYATA[butir.nama]);
			const rincian = beraspek
				? ` Untuk ${beraspek.nama}, aspek yang ditelaah penilai meliputi ${ASPEK_NYATA[beraspek.nama]}.`
				: '';
			return `Indikator kinerja utama yang ditelaah pada kriteria ini: ${daftar}. Namanya mengikuti matriks penilaian LAM Teknik.${rincian}`;
		},
	},
	{
		akhiran: '4',
		judulPoin: 'Analisis Faktor Keberhasilan dan Penghambat',
		isiTeks: ({ judulKriteria }) =>
			`Bagian ini biasanya membahas faktor yang mendukung maupun menghambat ketercapaian ${judulKriteria.toLowerCase()}, disertai akar masalahnya, bukan sekadar mendaftar keadaan.`,
	},
	{
		akhiran: '5',
		judulPoin: 'Strategi Perbaikan dan Pengembangan',
		isiTeks: ({ judulKriteria }) =>
			`Bagian ini biasanya menutup uraian ${judulKriteria.toLowerCase()} dengan rencana tindak lanjut yang terukur beserta penanggung jawab dan tenggatnya, umumnya bersandar pada analisis di bagian sebelumnya.`,
	},
];

/** `0 → 'a'`, `1 → 'b'`, seterusnya; kembali ke 'a' bila daftarnya luar biasa panjang. */
function huruf(urutan: number): string {
	return String.fromCharCode(97 + (urutan % 26));
}

function keButirIku(kriteria: RubricCriterion): ButirIku {
	return { nama: bersihkanNamaIndikator(kriteria.kriteria), tipeSkor: kriteria.tipeSkor };
}

/**
 * Poin pedoman penulisan yang mencocoki satu nomor bab.
 *
 * Async karena sumbernya (`rubricCriterionAmiRepository`) jaringan, bukan
 * konstanta modul lagi — beda dari versi sebelumnya, yang bisa sinkron karena
 * datanya memang tiruan. Larik kosong berarti LAM tidak mengatur bab itu (BAB
 * I Pendahuluan, BAB IV Penutup) — bukan kegagalan pemuatan.
 *
 * `accreditationSetId`: kriteria diambil dari Set Akreditasi yang benar-benar
 * dipilih dokumen ini (row 90-an, `ledProjectRepository`), bukan lagi satu
 * matriks LAM Teknik global.
 *
 * ponytail: `KELOMPOK_KRITERIA`/`POIN_PEDOMAN` di bawah masih mengasumsikan
 * struktur & rentang nomor indikator LAM Teknik 64-indikator apa adanya —
 * kalau `accreditationSetId` menunjuk Set Akreditasi kustom (jumlah/struktur
 * indikator beda), pengelompokan C.1–C.7 di bawah bisa salah/kosong. Menulis
 * ulang isi pedoman supaya data-driven per set adalah pekerjaan terpisah yang
 * lebih besar dari sekadar ganti sumber data.
 */
export async function findPanduanForBab(
	urutanBab: number,
	accreditationSetId: string | null | undefined,
): Promise<PoinPanduan[]> {
	if (urutanBab !== 2 && urutanBab !== 3) return [];

	const semua = await rubricCriterionAmiRepository.findAll(accreditationSetId);

	if (urutanBab === 3) {
		// BAB III "Program Pengembangan Berkelanjutan" — penutup 3 indikator
		// (Analisis SWOT, Tujuan Strategi Pengembangan, Program Pengembangan
		// Berkelanjutan) yang namanya cocok persis judul babnya sendiri.
		const indikator = semua
			.filter((k) => k.urutanBab.includes(3))
			.map(keButirIku);
		return POIN_PEDOMAN.map((poin) => ({
			id: `poin-pedoman-3-${poin.akhiran}`,
			sumber: PANDUAN_LED,
			kodePoin: `3.${poin.akhiran}`,
			judulPoin: poin.judulPoin,
			isiTeks: poin.isiTeks({
				judulKriteria: 'Program Pengembangan Berkelanjutan',
				indikator,
			}),
			iku: poin.akhiran === '3' ? indikator : [],
		}));
	}

	// BAB II: kerangka lima poin diulang sekali per kelompok C.1–C.7.
	return KELOMPOK_KRITERIA.flatMap((kelompok) => {
		const indikator = semua
			.filter((k) => k.no >= kelompok.dariNo && k.no <= kelompok.sampaiNo)
			.map(keButirIku);

		return POIN_PEDOMAN.map((poin) => ({
			id: `poin-pedoman-2-${kelompok.nomor}-${poin.akhiran}`,
			sumber: PANDUAN_LED,
			kodePoin: `${kelompok.nomor}.${poin.akhiran}`,
			judulPoin: poin.judulPoin,
			isiTeks: poin.isiTeks({ judulKriteria: kelompok.judul, indikator }),
			iku: poin.akhiran === '3' ? indikator : [],
		}));
	});
}

/**
 * Rubrik yang jadi sasaran tulisan satu bab — indikator matriks penilaian AMI
 * yang `urutanBab`-nya mencakup bab ini (`rubricCriterionAmiRepository`).
 *
 * Async untuk alasan yang sama seperti {@link findPanduanForBab}.
 */
export async function findRubrikDipakaiForBab(
	urutanBab: number,
	accreditationSetId: string | null | undefined,
): Promise<ButirRubrikDipakai[]> {
	const semua = await rubricCriterionAmiRepository.findAll(accreditationSetId);
	return semua
		.filter((kriteria) => kriteria.urutanBab.includes(urutanBab))
		.map((kriteria) => ({
			kriteria,
			target: kriteria.levelSkor.reduce((a, b) => (b.skor > a.skor ? b : a)),
		}));
}

/** Dokumen matriks penilaian; dipakai kelompok rubrik di panel. */
export function sumberRubrik(): SumberPanduan {
	return MATRIKS_PENILAIAN;
}
