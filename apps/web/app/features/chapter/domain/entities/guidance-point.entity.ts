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
 * - **NYATA -- kerangka LED-PS.** `CHAPTER_TEMPLATE` (4 bab) diverifikasi dari
 *   `led_bab_tabel.json` (struktur asli LED PJJ Teknik Telekomunikasi,
 *   diekstrak dari dokumen contoh) -- lewat field `bab` tiap heading, bukan
 *   sekadar urutan tampil. Kriteria ditugaskan ke bab lewat `chapterOrders`-nya
 *   sendiri (diisi manual atau auto-parse saat Set Akreditasi dibuat), bukan
 *   rentang nomor yang ditebak di sini.
 * - **NYATA -- kriteria Set Akreditasi yang dipilih dokumen ini.** Diambil
 *   langsung dari `rubricCriterionAmiRepository`, yang sekarang membaca Set
 *   Akreditasi dokumen (`accreditation-set.repository.ts`), bukan lagi satu
 *   matriks LAM Teknik global. Bukan kutipan tersalin di sini -- diminta
 *   langsung tiap dipanggil, supaya tidak ada dua salinan yang bisa berbeda isi.
 * - **NYATA -- pengelompokan tiap poin pedoman.** {@link kelompokkanKriteria}
 *   mengelompokkan berdasarkan `kriteria.kriteria` (nama kelompok) kriteria itu
 *   sendiri, data nyata dari Set Akreditasi yang dipilih -- bukan lagi rentang
 *   nomor C.1--C.7 LAM Teknik yang di-hardcode/ditebak seperti versi lama file
 *   ini, jadi tetap benar untuk set kustom apa pun strukturnya.
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
 * Kelompokkan kriteria satu bab berdasarkan `kriteria.kriteria` (nama
 * kelompok) apa adanya -- data nyata dari Set Akreditasi yang dipilih
 * dokumen ini, bukan lagi rentang nomor indikator LAM Teknik yang
 * di-hardcode (C.1–C.7). Berapa pun jumlah kelompoknya dan apa pun
 * namanya di set kustom, pengelompokan ini ikut -- tidak berasumsi
 * strukturnya selalu LAM Teknik 64-indikator.
 */
function kelompokkanKriteria(
	kriteria: RubricCriterion[],
): { judul: string; indikator: RubricCriterion[] }[] {
	const urutanMuncul: string[] = [];
	const perKelompok = new Map<string, RubricCriterion[]>();
	for (const k of kriteria) {
		if (!perKelompok.has(k.kriteria)) {
			perKelompok.set(k.kriteria, []);
			urutanMuncul.push(k.kriteria);
		}
		perKelompok.get(k.kriteria)!.push(k);
	}
	return urutanMuncul.map((judul) => ({ judul, indikator: perKelompok.get(judul)! }));
}

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
 * konstanta modul lagi -- beda dari versi sebelumnya, yang bisa sinkron karena
 * datanya memang tiruan. Larik kosong berarti bab ini tidak punya kriteria
 * yang ditugaskan ke situ (lewat `chapterOrders` tiap kriteria) -- bukan
 * kegagalan pemuatan, dan bukan lagi dibatasi ke bab 2/3 saja: set kustom
 * bebas menugaskan kriterianya ke bab manapun.
 *
 * `accreditationSetId`: kriteria diambil dari Set Akreditasi yang benar-benar
 * dipilih dokumen ini (row 90-an, `ledProjectRepository`), bukan lagi satu
 * matriks LAM Teknik global. Pengelompokan (`kelompokkanKriteria`) turun dari
 * `kriteria.kriteria` set itu sendiri, jadi tetap benar untuk berapa pun
 * jumlah kelompok/indikator set kustomnya.
 */
export async function findPanduanForBab(
	urutanBab: number,
	accreditationSetId: string | null | undefined,
): Promise<PoinPanduan[]> {
	const semua = await rubricCriterionAmiRepository.findAll(accreditationSetId);
	const kriteriaBab = semua.filter((k) => k.urutanBab.includes(urutanBab));
	if (kriteriaBab.length === 0) return [];

	return kelompokkanKriteria(kriteriaBab).flatMap((kelompok, indeksKelompok) => {
		const nomorKelompok = indeksKelompok + 1;
		const indikator = kelompok.indikator.map(keButirIku);

		return POIN_PEDOMAN.map((poin) => ({
			id: `poin-pedoman-${urutanBab}-${nomorKelompok}-${poin.akhiran}`,
			sumber: PANDUAN_LED,
			kodePoin: `${nomorKelompok}.${poin.akhiran}`,
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
