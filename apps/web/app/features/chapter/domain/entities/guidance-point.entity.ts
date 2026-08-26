import {
	findKriteriaForBab,
	type RubricCriterion,
	type RubricLevel,
	type RubricScoreType,
} from './rubric-criterion.entity';

/**
 * Poin panduan yang dirujuk AI saat menyusun sebuah bab
 * (docs/application_flow.md §11.1b, docs/database.md §13–§15).
 *
 * **Master data global.** Sama untuk semua tenant, di-seed sekali, tidak pernah
 * disunting lewat UI — karena itu ia konstanta modul di berkas ini, bukan
 * repository localStorage, sejajar dengan `RUBRIK_KRITERIA` dan
 * `CHAPTER_TEMPLATE` yang sudah lebih dulu mengambil keputusan yang sama.
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
 * Ini bagian yang paling perlu dibaca sebelum menyunting berkas ini. §11.1 dua
 * kali menolak membangun bagian panduan dengan alasan "menyeed panduan lebih
 * dulu berarti mengarang keterkaitan yang belum ada", dan alasan itu tidak
 * sepenuhnya gugur: **poin panduan bersifat normatif**. Kutipan bukti dukung
 * yang meleset masih bisa diperiksa penggunanya dengan membuka berkasnya
 * sendiri; poin panduan yang dikarang mengaku menyampaikan tuntutan LAM, dan
 * penyusun yang memercayainya tidak punya cara mendeteksi kekeliruannya.
 *
 * Karena itu yang dipakai di sini sebisa mungkin bahan yang benar-benar ada:
 *
 * - **NYATA — kerangka LED-PS.** `CHAPTER_TOC` memuat struktur aslinya: BAB I–III,
 *   `C.1.`…`C.9.`, dan `D. Analisis dan Penetapan Program Pengembangan`. Sub-poin
 *   C.1 terurai penuh di sana: `1.1 Latar Belakang`, `1.2 Kebijakan`,
 *   `1.3 Indikator Kinerja Utama (IKU)`, `1.4 Analisis Faktor…`,
 *   `1.5 Strategi perbaikan…`.
 * - **NYATA — nama indikator.** Diambil apa adanya dari
 *   `apps/ai/data/reference_scores_claude.csv`, 60 indikator LAM Teknik beserta
 *   tipe skornya. Bukti silang bahwa nama-nama itu memang LAM: sub-poin
 *   `1.3 a/b/c` di `CHAPTER_TOC` cocok persis dengan indikator 1/2/3 di CSV —
 *   dua berkas yang tidak saling tahu menyebut hal yang sama.
 * - **NYATA — rincian aspek S4** untuk indikator 1, 4, dan 8, dari
 *   `apps/ai/data/penilaian_10_rubrik_sarjana_terapan.csv`.
 * - **INFERENSI — pengulangan kerangka lima poin ke C.2–C.9.** Hanya C.1 yang
 *   terurai di `CHAPTER_TOC`; sisanya disimpulkan dari format LED-PS yang memang
 *   berulang. `chapter-toc.entity.ts` sendiri memilih **tidak** menebak isi
 *   C.2–C.9, jadi keputusan berbeda di sini disebutkan terang-terangan, bukan
 *   diam-diam: yang diulang cuma judul bagiannya, bukan isinya.
 * - **INFERENSI — pemetaan bab → indikator** di {@link INDIKATOR_PER_BAB}. CSV-nya
 *   tidak membawa pengelompokan kriteria sama sekali; pemetaan ini diturunkan
 *   dari nama indikator dan struktur LED. Itu penilaian, bukan data.
 * - **TIRUAN — seluruh kalimat `isiTeks`.** Tidak ada satu kalimat pedoman LAM
 *   pun di repo ini. Aturan penulisannya di {@link POIN_PEDOMAN}.
 *
 * Konsekuensinya dinyatakan di layar, bukan didiamkan: kaki panel dan kaki laci
 * sama-sama menyebut bahwa rumusannya contoh dan bukan kutipan resmi.
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
 * sudah tersaring untuk satu bab — pola yang sama dipakai `findKriteriaForBab`.
 */
export type PoinPanduan = {
	id: string;
	sumber: SumberPanduan;
	/** Penomoran asli dokumen, mis. `4.3` atau `D.2`. */
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
 * Nomor kriteria LAM untuk tiap bab yang memang berupa bab kriteria.
 *
 * Bab 4 adalah "Kriteria 1", bab 12 adalah "Kriteria 9" — lihat
 * `CHAPTER_TEMPLATE`. Bab 13 bukan bab kriteria tapi tetap punya poin panduan
 * sendiri (`D. Analisis dan Penetapan Program Pengembangan` di `CHAPTER_TOC`),
 * jadi ia ditangani terpisah.
 */
const NOMOR_KRITERIA: Record<number, number> = {
	4: 1,
	5: 2,
	6: 3,
	7: 4,
	8: 5,
	9: 6,
	10: 7,
	11: 8,
	12: 9,
};

/**
 * Nama indikator LAM Teknik per bab — **dikutip apa adanya** dari
 * `apps/ai/data/reference_scores_claude.csv`, tanpa diperhalus dan tanpa
 * diterjemahkan ulang.
 *
 * **Pemetaannya inferensi, bukan data.** CSV itu hanya membawa `indicator_no`
 * dan `kriteria`; pengelompokannya ke kriteria C.1–C.9 disimpulkan dari nama
 * indikatornya sendiri. Yang paling tidak pasti: indikator 31–37 (kinerja dan
 * luaran DTPS) ditaruh di bab 7 bersama SDM, padahal bisa juga dibaca sebagai
 * luaran di bab 12; dan 53/55 (SPMI, AMI) ditaruh di bab 5 bersama tata pamong.
 */
const INDIKATOR_PER_BAB: Record<number, ButirIku[]> = {
	4: [
		{ nama: 'Kekhasan VMTS', tipeSkor: 'kualitatif' },
		{ nama: 'Mekanisme penyusunan VMTS', tipeSkor: 'kualitatif' },
		{ nama: 'Tingkat pemahaman dan pencapaian VMTS', tipeSkor: 'kualitatif' },
	],
	5: [
		{ nama: 'Sistem tata pamong', tipeSkor: 'komposit' },
		{
			nama: 'Komitmen pimpinan dan kemampuan manajerial',
			tipeSkor: 'komposit',
		},
		{ nama: 'Relevansi dan tingkat kerja sama', tipeSkor: 'komposit' },
		{ nama: 'Pelaksanaan kerja sama', tipeSkor: 'kualitatif' },
		{ nama: 'Unit SPMI dan pengakuan mutu', tipeSkor: 'komposit' },
		{ nama: 'Keterlaksanaan SPMI dan AMI', tipeSkor: 'kualitatif' },
	],
	// Sengaja tipis, dan **tidak ditambal**. Yang tersisa untuk Kriteria 3 cuma
	// dua nama, dan keduanya tidak menyentuh keketatan seleksi maupun layanan
	// kemahasiswaan yang justru ditanya `RUBRIK_KRITERIA` untuk bab yang sama.
	// Menambahkan nama karangan supaya kelompoknya terlihat seimbang persis
	// jenis karangan yang dihindari seluruh berkas ini — dan selisihnya sendiri
	// adalah keterangan yang jujur tentang seberapa sebagian data yang terparsing.
	6: [
		{ nama: 'Rasio mahasiswa terhadap dosen', tipeSkor: 'kuantitatif' },
		{ nama: 'Mahasiswa asing', tipeSkor: 'kuantitatif' },
	],
	7: [
		{ nama: 'Profil dosen (NDTPS, PDTT)', tipeSkor: 'kuantitatif' },
		{ nama: 'DTPS bergelar doktor', tipeSkor: 'kuantitatif' },
		{
			nama: 'DTPS berjabatan guru besar, lektor kepala, dan lektor',
			tipeSkor: 'kuantitatif',
		},
		{ nama: 'Tenaga kependidikan', tipeSkor: 'kualitatif' },
		{ nama: 'Beban kerja DTPS', tipeSkor: 'kuantitatif' },
		{ nama: 'Kinerja penelitian DTPS', tipeSkor: 'kuantitatif' },
		{ nama: 'Kinerja PkM DTPS', tipeSkor: 'kuantitatif' },
		{ nama: 'Publikasi DTPS', tipeSkor: 'kuantitatif' },
		{ nama: 'Luaran HKI dan paten DTPS', tipeSkor: 'kuantitatif' },
		{
			nama: 'Publikasi internasional bereputasi DTPS',
			tipeSkor: 'kuantitatif',
		},
		{ nama: 'Karya ilmiah DTPS yang disitasi', tipeSkor: 'kuantitatif' },
		{ nama: 'Rekognisi DTPS', tipeSkor: 'kuantitatif' },
	],
	8: [
		{ nama: 'Pengelolaan keuangan', tipeSkor: 'kualitatif' },
		{
			nama: 'Biaya operasional pendidikan per mahasiswa per tahun',
			tipeSkor: 'kuantitatif',
		},
		{ nama: 'Dana penelitian DTPS', tipeSkor: 'kuantitatif' },
		{ nama: 'Dana PkM DTPS', tipeSkor: 'kuantitatif' },
		{ nama: 'Sarana dan prasarana', tipeSkor: 'komposit' },
		{
			nama: 'Keselamatan, kesehatan kerja, dan lingkungan (K3L)',
			tipeSkor: 'kualitatif',
		},
	],
	9: [
		{ nama: 'Pemutakhiran kurikulum', tipeSkor: 'kualitatif' },
		{ nama: 'Profil lulusan dan CPL', tipeSkor: 'komposit' },
		{ nama: 'Kesesuaian dan tinjauan CPL', tipeSkor: 'komposit' },
		{ nama: 'Rencana pembelajaran semester (RPS)', tipeSkor: 'komposit' },
		{ nama: 'Proses pembelajaran', tipeSkor: 'komposit' },
		{
			nama: 'Integrasi penelitian dan PkM dalam pembelajaran',
			tipeSkor: 'kualitatif',
		},
		{ nama: 'Persentase jam praktikum', tipeSkor: 'kuantitatif' },
		{ nama: 'Basic sciences dan matematika', tipeSkor: 'kualitatif' },
		{ nama: 'Capstone design', tipeSkor: 'kualitatif' },
		{ nama: 'Suasana akademik', tipeSkor: 'komposit' },
	],
	10: [
		{ nama: 'Penelitian: peta jalan dan relevansi', tipeSkor: 'kualitatif' },
		{
			nama: 'Penelitian DTPS yang melibatkan mahasiswa',
			tipeSkor: 'kuantitatif',
		},
	],
	11: [
		{
			nama: 'PkM: kesesuaian peta jalan dan visi keilmuan',
			tipeSkor: 'kualitatif',
		},
		{ nama: 'PkM yang melibatkan mahasiswa', tipeSkor: 'kuantitatif' },
	],
	12: [
		{ nama: 'IPK lulusan', tipeSkor: 'kuantitatif' },
		{
			nama: 'Prestasi akademik dan nonakademik mahasiswa',
			tipeSkor: 'komposit',
		},
		{ nama: 'Masa studi', tipeSkor: 'kuantitatif' },
		{ nama: 'Persentase lulusan tepat waktu', tipeSkor: 'kuantitatif' },
		{ nama: 'Publikasi ilmiah mahasiswa', tipeSkor: 'kuantitatif' },
		{ nama: 'Luaran HKI dan paten mahasiswa', tipeSkor: 'kuantitatif' },
		{ nama: 'Tracer study', tipeSkor: 'kualitatif' },
		{ nama: 'Waktu tunggu lulusan', tipeSkor: 'kuantitatif' },
		{ nama: 'Kesesuaian bidang kerja lulusan', tipeSkor: 'kuantitatif' },
		{ nama: 'Tingkat dan ukuran tempat kerja lulusan', tipeSkor: 'kuantitatif' },
		{ nama: 'Tingkat kepuasan pengguna lulusan', tipeSkor: 'kuantitatif' },
	],
};

/**
 * Rincian aspek penilaian tingkat tertinggi yang **nyata**, dikutip dari
 * `apps/ai/data/penilaian_10_rubrik_sarjana_terapan.csv`.
 *
 * Hanya tiga indikator yang punya rincian ini di sumbernya, dan tidak ada yang
 * ditambahkan sendiri — indikator lain sekadar tidak menyebut aspeknya.
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
 * 3. **Nama indikator dikutip apa adanya**, tidak diparafrase.
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

/**
 * Judul kriteria tanpa awalan "Kriteria N — ", untuk disisipkan ke dalam
 * kalimat. `CHAPTER_TEMPLATE` menulis bab 4 sebagai
 * "Kriteria 1 — Visi, Misi, Tujuan, dan Strategi"; yang dibutuhkan kalimatnya
 * cuma bagian sesudah tanda pisah.
 */
const JUDUL_KRITERIA: Record<number, string> = {
	4: 'Visi, Misi, Tujuan, dan Strategi',
	5: 'Tata Pamong, Tata Kelola, dan Kerja Sama',
	6: 'Mahasiswa',
	7: 'Sumber Daya Manusia',
	8: 'Keuangan, Sarana, dan Prasarana',
	9: 'Pendidikan',
	10: 'Penelitian',
	11: 'Pengabdian kepada Masyarakat',
	12: 'Luaran dan Capaian Tridharma',
	13: 'Analisis dan Penetapan Program Pengembangan',
};

/**
 * Poin di luar sembilan bab kriteria.
 *
 * Sengaja **tidak** memakai kerangka lima bagian — kerangka itu milik bab
 * kriteria, dan memaksakannya ke bab lain berarti mengarang struktur yang tidak
 * ada.
 *
 * `D.2` sengaja dipetakan ke **dua bab sekaligus**, dan itu satu-satunya hal di
 * fitur ini yang membuktikan `PANDUAN_DETAIL_BAB` memang many-to-many, bukan
 * larik hiasan: bab 2 bernama "Kondisi Eksternal" di `CHAPTER_TEMPLATE`, dan
 * simpul Daftar Isi yang menunjuknya berbunyi "B. Analisis Lingkungan Eksternal
 * dalam Pengembangan UPPS dan Prodi" — poin yang sama persis dengan yang dibaca
 * bab 13, dari sudut yang berbeda.
 */
const POIN_LUAR_KRITERIA: {
	akhiran: string;
	judulPoin: string;
	isiTeks: string;
	iku: ButirIku[];
	urutanBab: number[];
}[] = [
	{
		akhiran: '1',
		judulPoin: 'Analisis Capaian Kinerja',
		isiTeks:
			'Bagian ini merangkum capaian seluruh kriteria jadi satu bacaan utuh, bukan menyalin ulang bab per bab. Yang dicari pola lintas kriteria dan konsistensi antara satu capaian dengan capaian lainnya.',
		iku: [
			{ nama: 'Indikator kinerja tambahan (IKT)', tipeSkor: 'kualitatif' },
			{ nama: 'Evaluasi capaian kinerja', tipeSkor: 'kualitatif' },
			{ nama: 'Kepuasan pemangku kepentingan', tipeSkor: 'kualitatif' },
		],
		urutanBab: [13],
	},
	{
		akhiran: '2',
		judulPoin: 'Analisis Lingkungan dan SWOT',
		isiTeks:
			'Bagian ini membaca lingkungan tempat program studi bekerja — kebijakan, pasar kerja, pesaing, dan mitra — lalu memetakannya jadi kekuatan, kelemahan, peluang, dan ancaman yang bisa ditindaklanjuti.',
		iku: [{ nama: 'Analisis lingkungan dan SWOT', tipeSkor: 'komposit' }],
		urutanBab: [2, 13],
	},
	{
		akhiran: '3',
		judulPoin: 'Program Pengembangan',
		isiTeks:
			'Bagian ini menurunkan hasil analisis jadi program yang punya sasaran, penanggung jawab, dan tenggat — bukan daftar keinginan.',
		iku: [
			{ nama: 'Tujuan strategis pengembangan', tipeSkor: 'kualitatif' },
			{ nama: 'Program pengembangan berkelanjutan', tipeSkor: 'kualitatif' },
		],
		urutanBab: [13],
	},
];

/**
 * Poin pedoman penulisan yang mencocoki satu nomor bab.
 *
 * Larik kosong berarti panduan LAM memang tidak mengatur bab itu — bukan
 * kegagalan pemuatan, dan tampilannya harus menyatakan itu. Bunyi yang sama
 * sudah dipakai {@link findKriteriaForBab}.
 */
export function findPanduanForBab(urutanBab: number): PoinPanduan[] {
	const nomor = NOMOR_KRITERIA[urutanBab];
	if (nomor) {
		const judulKriteria = JUDUL_KRITERIA[urutanBab];
		const indikator = INDIKATOR_PER_BAB[urutanBab] ?? [];

		return POIN_PEDOMAN.map((poin) => ({
			id: `poin-pedoman-${urutanBab}-${poin.akhiran}`,
			sumber: PANDUAN_LED,
			kodePoin: `${nomor}.${poin.akhiran}`,
			judulPoin: poin.judulPoin,
			isiTeks: poin.isiTeks({ judulKriteria, indikator }),
			iku: poin.akhiran === '3' ? indikator : [],
		}));
	}

	return POIN_LUAR_KRITERIA.filter((poin) =>
		poin.urutanBab.includes(urutanBab),
	).map((poin) => ({
		id: `poin-pedoman-d-${poin.akhiran}`,
		sumber: PANDUAN_LED,
		kodePoin: `D.${poin.akhiran}`,
		judulPoin: poin.judulPoin,
		isiTeks: poin.isiTeks,
		iku: poin.iku,
	}));
}

/**
 * Rubrik yang jadi sasaran tulisan satu bab.
 *
 * **Bukan katalog baru**: seluruhnya turunan `RUBRIK_KRITERIA`, karena dua
 * daftar indikator yang berdiri sendiri-sendiri pasti akan berbeda isinya suatu
 * saat — alasan yang sudah ditulis `rubric-criterion.entity.ts` untuk dirinya
 * sendiri. Menambah master data kedua di sini hanya akan mengulangi kesalahan
 * yang berkas itu sengaja hindari.
 *
 * `reduce` tanpa nilai awal, bukan `levelUntukSkor(k, skorMaksimal(k))!`:
 * skemanya sudah menjamin `levelSkor` tidak pernah kosong, jadi bentuk ini tidak
 * butuh tanda seru yang justru menutupi satu-satunya kemungkinan gagalnya.
 */
export function findRubrikDipakaiForBab(
	urutanBab: number,
): ButirRubrikDipakai[] {
	return findKriteriaForBab(urutanBab).map((kriteria) => ({
		kriteria,
		target: kriteria.levelSkor.reduce((a, b) => (b.skor > a.skor ? b : a)),
	}));
}

/** Dokumen matriks penilaian; dipakai kelompok rubrik di panel. */
export function sumberRubrik(): SumberPanduan {
	return MATRIKS_PENILAIAN;
}
