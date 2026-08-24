import {
	findKriteriaByNo,
	findKriteriaForBab,
} from './rubric-criterion.entity';

/**
 * Katalog bukti dukung yang biasanya jadi tumpuan tiap bab
 * (docs/application_flow.md §12.1b), beserta cara memeriksa mana yang belum ada
 * padanannya di pustaka.
 *
 * **Master data global, bukan mock jaringan.** Ia sama untuk semua tenant,
 * di-seed sekali, dan tidak pernah disunting lewat UI — alasan yang sama persis
 * yang membuat `RUBRIK_KRITERIA` hidup sebagai konstanta modul di berkas
 * tetangganya, bukan repository localStorage.
 *
 * **Kenapa sinkron, padahal ini "rekomendasi AI".** Dua sebab, keduanya
 * terukur. Pertama, `TabsContent` di Editor Bab tidak memakai `keepMounted`,
 * jadi panel Generasi dilepas dari pohon setiap kali tab berpindah — sumber
 * asinkron berarti spinner di kolom 320 px pada tiap kali tab dibuka kembali.
 * Kedua, `storage-update` menyala beberapa kali per unggahan selagi ekstraksi
 * berjalan `MENUNGGU → DIPROSES → SIAP`; turunan asinkron akan mengedipkan
 * spinner berulang tepat saat pembacanya sedang membaca. Fungsi murni membuat
 * kedua persoalan itu tidak pernah ada.
 *
 * Presedennya sudah ada di dalam konvensi yang sama: `nilaiKriteria()` di
 * `chapter-scoring.mock.ts` juga fungsi murni sinkron; `delay` diekspor
 * terpisah dan hanya dipakai pemanggil yang memang perlu *terlihat* asinkron.
 *
 * **`sidikJari` sengaja tidak diimpor.** Konvensi itu ada untuk menjaga
 * keluaran mock tetap stabil, sedangkan fungsi murni atas
 * `(urutanBab, namaBerkas)` sudah stabil semaksimalnya. Tidak ada yang perlu
 * diacak, jadi tidak ada yang perlu dijinakkan.
 *
 * **Yang sengaja tidak ada di sini:** kolom kategori pada `BuktiDukung`.
 * Pemeriksaannya bersandar pada nama berkas, dan itu tambalan yang sadar diri —
 * docs/application_flow.md §16 pertanyaan terbuka #9 memang masih
 * menggantungkan soal tag/kategori per kriteria LAM. Begitu kolom itu ada,
 * {@link KebutuhanBukti.penanda} adalah satu-satunya field yang dihapus.
 */
export type KebutuhanBukti = {
	/** Stabil; key React sekaligus identitas baris katalog. */
	kunci: string;
	/**
	 * Nama artefaknya, bukan judul kebutuhannya.
	 *
	 * Bedanya menentukan: langkah pengguna berikutnya adalah mencari sebuah
	 * berkas di folder, dan kebutuhan yang dirumuskan sebagai anak kalimat
	 * ("bukti kerja sama yang ditandatangani") tidak bisa dipetakan ke nama
	 * berkas. Frasa benda yang bisa dicari bisa.
	 */
	nama: string;
	/**
	 * Kenapa ia diminta, 3–5 kata, dicetak sesudah kode kriteria.
	 *
	 * Untuk baris {@link KebutuhanBukti.dariTabelLkps} isinya selalu frasa tetap
	 * `angka indikator, bukan narasi` — itu seluruh argumen `tipeSkor:
	 * 'kuantitatif'` dalam empat kata, dan pembacanya belajar bedanya dari dua
	 * kartu tanpa perlu legenda.
	 */
	untuk: string;
	/**
	 * Frasa yang menandai kebutuhan ini sudah terpenuhi, dicocokkan sebagai
	 * frasa utuh di batas kata atas nama berkas yang sudah dinormalisasi.
	 *
	 * Sengaja **murah hati**. Dua mode gagalnya tidak setara: menyatakan sebuah
	 * dokumen belum ada padahal barisnya terlihat beberapa baris di bawah, di
	 * panel yang sama, adalah pertentangan yang nyaring — persis kesalahan yang
	 * membuat panel "Perlu Perhatian" dicabut. Sedangkan menganggap sesuatu
	 * sudah ada padahal cuma mirip hanya berarti satu dorongan yang tidak
	 * muncul. Arah yang murah itulah yang dipeluk.
	 */
	penanda: string[];
	/** Indikator rubrik yang menuntutnya ({@link RubricCriterion.no}). */
	indikatorNo: number[];
	/** `true` bila ia menyuplai angka tabel LKPS — diurutkan lebih dulu. */
	dariTabelLkps: boolean;
	/**
	 * `true` bila yang dituntut **hasil**, sehingga berkas yang menamai dirinya
	 * panduan atau format tidak boleh dianggap memenuhinya.
	 * Lihat {@link PENANDA_BUKAN_BUKTI}.
	 */
	hasilBukanPanduan: boolean;
};

/** Satu kebutuhan yang sudah dirakit untuk satu bab, siap dicetak. */
export type RekomendasiBukti = {
	kunci: string;
	nama: string;
	/** Sudah jadi, misal `"C2 · bukti mutu tiap kerja sama"`. */
	jejak: string;
};

/**
 * Berkas yang namanya menyatakan dirinya panduan atau format, bukan hasil.
 *
 * `Panduan_Tracer_Study.pdf` menerangkan **cara** melakukan tracer study; ia
 * bukan hasilnya. Menghitungnya sebagai pemenuhan akan membungkam kebutuhan
 * yang justru paling sering luput — dan "sudah aman" yang keliru jauh lebih
 * merusak daripada tidak punya pemeriksaan ini sama sekali.
 *
 * Hanya berlaku untuk baris {@link KebutuhanBukti.hasilBukanPanduan}. Sebagian
 * kebutuhan memang berupa pedoman — `tata-pamong-spmi`, `dokumen-kurikulum` —
 * dan di sana `Pedoman_Akademik_Universitas.docx` justru pemenuhan yang sah.
 */
const PENANDA_BUKAN_BUKTI = [' panduan ', ' pedoman ', ' template ', ' format '];

/**
 * Nama berkas jadi arus token berspasi yang **diapit spasi**.
 *
 * Pengapitnya yang membuat pencocokan berhenti di batas kata: tanpa itu,
 * penanda pendek seperti `rps`, `bkd`, dan `rab` akan menyala di tengah kata
 * lain — `rps` di dalam `LKPS_…` — dan rekomendasinya justru hilang pada prodi
 * yang paling membutuhkannya.
 *
 * Ekstensinya dibuang lebih dulu, dan itu bukan pengulangan dari penggantian
 * `[^a-z0-9]+`: ia yang mencegah `pdf`, `png`, dan `xlsx` ikut jadi token yang
 * bisa dicocokkan.
 */
function normalkan(teks: string): string {
	return ` ${teks
		.replace(/\.[a-z0-9]+$/i, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()} `;
}

/**
 * Kebutuhan bukti dukung per indikator.
 *
 * **Dikunci nomor indikator, bukan nomor bab** — mencerminkan
 * `RubricCriterion.urutanBab`, idiom denormalisasi yang sudah dipakai fitur
 * ini. Untungnya tiga: bab yang tidak dinilai rubrik (1, 2, 3, 14) gugur
 * sendiri tanpa daftar pengecualian kedua yang harus dijaga selaras; satu baris
 * bisa melayani banyak indikator sekaligus; dan `untuk`-nya boleh menyebut
 * indikatornya, karena tautannya nyata.
 *
 * Aturan penulisannya: baris terurut menaik menurut indikator pertamanya, tidak
 * ada bab yang melebihi lima baris, dan `penanda` selalu berlebih ketimbang
 * kurang.
 *
 * **Satu baris `data-lkps`, bukan satu baris per tabel.** Satu workbook LKPS
 * memuat semua tabelnya, jadi memecahnya per tabel hanya menghasilkan beberapa
 * kartu yang selalu muncul dan hilang serentak. Nama tabelnya sendiri sudah
 * hidup di `RubricCriterion.tabelLkps` dan ditampilkan tab Review; mengulangnya
 * di sini menciptakan dua tempat yang bisa berselisih.
 */
export const KATALOG_KEBUTUHAN_BUKTI: KebutuhanBukti[] = [
	{
		kunci: 'penetapan-vmts',
		nama: 'Dokumen penetapan visi, misi, tujuan, dan strategi',
		untuk: 'dasar rumusan resmi VMTS',
		penanda: ['statuta', 'renstra', 'rencana strategis', 'visi misi', 'vmts'],
		indikatorNo: [1],
		dariTabelLkps: false,
		hasilBukanPanduan: false,
	},
	{
		kunci: 'pelibatan-pemangku',
		nama: 'Berita acara pelibatan pemangku kepentingan',
		untuk: 'bukti VMTS disusun bersama',
		penanda: ['berita acara', 'notulen', 'sosialisasi', 'lokakarya', 'fgd'],
		indikatorNo: [2],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'tata-pamong-spmi',
		nama: 'Dokumen formal tata pamong dan SPMI',
		untuk: 'dasar tata kelola prodi',
		penanda: [
			'spmi',
			'penjaminan mutu',
			'tata pamong',
			'struktur organisasi',
			'statuta',
		],
		indikatorNo: [3],
		dariTabelLkps: false,
		hasilBukanPanduan: false,
	},
	{
		kunci: 'laporan-ami',
		nama: 'Laporan Audit Mutu Internal (AMI)',
		untuk: 'bukti siklus mutu berjalan',
		penanda: ['audit mutu', 'laporan ami', 'audit internal'],
		indikatorNo: [3],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'perjanjian-kerja-sama',
		nama: 'Naskah perjanjian kerja sama (MoU/MoA)',
		untuk: 'bukti mutu tiap kerja sama',
		penanda: [
			'mou',
			'moa',
			'perjanjian kerja sama',
			'nota kesepahaman',
			'naskah kerja sama',
		],
		indikatorNo: [4],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'data-lkps',
		nama: 'Data LKPS program studi',
		untuk: 'angka indikator, bukan narasi',
		penanda: ['lkps', 'laporan kinerja program studi'],
		indikatorNo: [4, 5, 7, 8, 10, 13, 14, 15, 16, 17],
		dariTabelLkps: true,
		hasilBukanPanduan: false,
	},
	{
		kunci: 'layanan-kemahasiswaan',
		nama: 'Laporan layanan dan kegiatan kemahasiswaan',
		untuk: 'bukti layanan berjalan',
		penanda: [
			'kemahasiswaan',
			'himpunan',
			'ormawa',
			'beasiswa',
			'konseling',
		],
		indikatorNo: [6],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'kualifikasi-dosen',
		nama: 'SK pengangkatan dan ijazah dosen tetap',
		untuk: 'dasar kualifikasi dosen',
		penanda: [
			'sk dosen',
			'ijazah',
			'sertifikat pendidik',
			'serdos',
			'jabatan fungsional',
		],
		indikatorNo: [7],
		dariTabelLkps: false,
		hasilBukanPanduan: false,
	},
	{
		kunci: 'beban-kerja-dosen',
		nama: 'Rekap Beban Kerja Dosen (BKD/EWMP)',
		untuk: 'dasar rasio dan beban',
		penanda: ['beban kerja', 'bkd', 'ewmp'],
		indikatorNo: [8],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'pengembangan-sdm',
		nama: 'Bukti pengembangan kompetensi dosen dan tendik',
		untuk: 'pelatihan dan studi lanjut',
		penanda: [
			'pengembangan kompetensi',
			'sertifikat pelatihan',
			'pelatihan dosen',
			'tugas belajar',
			'studi lanjut',
		],
		indikatorNo: [9],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'penggunaan-dana',
		nama: 'Laporan keuangan atau RKAT unit pengelola',
		untuk: 'dasar angka dana operasional',
		penanda: [
			'laporan keuangan',
			'rkat',
			'anggaran',
			'rab',
			'penggunaan dana',
		],
		indikatorNo: [10],
		dariTabelLkps: false,
		hasilBukanPanduan: false,
	},
	{
		kunci: 'sarana-prasarana',
		nama: 'Daftar sarana dan prasarana pembelajaran',
		untuk: 'kecukupan ruang dan alat',
		penanda: [
			'sarana',
			'prasarana',
			'inventaris',
			'ruang kuliah',
			'daftar aset',
		],
		indikatorNo: [11],
		dariTabelLkps: false,
		hasilBukanPanduan: false,
	},
	{
		kunci: 'dokumen-kurikulum',
		nama: 'Dokumen kurikulum dan capaian pembelajaran',
		untuk: 'relevansi CPL prodi',
		penanda: [
			'kurikulum',
			'cpl',
			'capaian pembelajaran',
			'rps',
			'silabus',
		],
		indikatorNo: [12],
		dariTabelLkps: false,
		hasilBukanPanduan: false,
	},
	{
		kunci: 'monev-pembelajaran',
		nama: 'Laporan monev pembelajaran dan hasil survei',
		untuk: 'bukti monev dijalankan',
		penanda: [
			'monev',
			'monitoring',
			'evaluasi pembelajaran',
			'survei',
			'kuesioner',
			'kepuasan mahasiswa',
		],
		indikatorNo: [13],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'laporan-penelitian',
		nama: 'Laporan penelitian dan surat tugas dosen',
		untuk: 'bukti penelitian terlaksana',
		penanda: [
			'laporan penelitian',
			'hibah',
			'surat tugas penelitian',
			'roadmap penelitian',
		],
		indikatorNo: [14],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'laporan-pkm',
		nama: 'Laporan kegiatan pengabdian kepada masyarakat',
		untuk: 'bukti PkM terlaksana',
		penanda: ['pengabdian', 'pkm', 'mitra binaan'],
		indikatorNo: [15],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'prestasi-mahasiswa',
		nama: 'Sertifikat prestasi mahasiswa tiga tahun terakhir',
		untuk: 'bukti tiap prestasi',
		penanda: [
			'sertifikat juara',
			'piagam',
			'prestasi',
			'juara',
			'kompetisi',
			'lomba',
		],
		indikatorNo: [16],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'publikasi-dosen',
		nama: 'Daftar publikasi ilmiah dosen dan mahasiswa',
		untuk: 'bukti tiap luaran',
		penanda: ['publikasi', 'sitasi'],
		indikatorNo: [16],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'tracer-study',
		nama: 'Laporan hasil tracer study lulusan',
		untuk: 'sumber angka masa tunggu',
		penanda: [
			'laporan tracer',
			'hasil tracer',
			'tracer study',
			'kuesioner alumni',
			'rekap alumni',
		],
		indikatorNo: [17],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
	{
		kunci: 'evaluasi-diri',
		nama: 'Dokumen evaluasi diri dan rencana pengembangan',
		untuk: 'dasar analisis capaian',
		penanda: [
			'evaluasi diri',
			'renstra',
			'rencana pengembangan',
			'rtl',
			'tindak lanjut',
		],
		indikatorNo: [18],
		dariTabelLkps: false,
		hasilBukanPanduan: true,
	},
];

/**
 * Sebuah kebutuhan dianggap **sudah terpenuhi** bila ada berkas yang namanya
 * mengandung salah satu penandanya — dan, bila kebutuhannya menuntut hasil,
 * berkas itu tidak menamai dirinya panduan atau format.
 */
function sudahTerpenuhi(
	kebutuhan: KebutuhanBukti,
	pustaka: readonly string[],
): boolean {
	return pustaka.some((nama) => {
		if (
			kebutuhan.hasilBukanPanduan &&
			PENANDA_BUKAN_BUKTI.some((kata) => nama.includes(kata))
		) {
			return false;
		}

		return kebutuhan.penanda.some((penanda) =>
			nama.includes(normalkan(penanda)),
		);
	});
}

/**
 * Bukti dukung yang dituntut kriteria satu bab tapi belum ada padanannya di
 * pustaka, terurut siap cetak.
 *
 * **Statusnya sengaja tidak disaring.** Berkas `MENUNGGU`, `DIPROSES`, maupun
 * `GAGAL` sudah diunggah, dan §4.5 menampilkan semuanya di daftar tepat di
 * bawah blok ini. Menyuruh mengunggah berkas yang baru diunggah sembilan puluh
 * detik lalu adalah kegagalan terburuk yang bisa dilakukan fitur ini.
 *
 * Untuk yang `GAGAL` ini ketidaktepatan yang disengaja: bloknya bersih
 * sementara barisnya di bawah masih memasang badge `GAGAL` dan catatannya.
 * **Daftar itu otoritas soal kesiapan; fungsi ini hanya soal kepemilikan** —
 * dan yang dibutuhkan berkas `GAGAL` memang ekstraksi ulang, bukan unggah
 * ulang.
 *
 * Larik kosong berarti tidak ada yang perlu diumumkan, dan pemanggilnya harus
 * memperlakukannya begitu: bab tanpa kriteria dan bab yang semua kebutuhannya
 * sudah terpenuhi sama-sama tidak menampilkan apa pun. Tidak ada pengumuman
 * "sudah lengkap" — pencocokan atas nama berkas tidak cukup kuat untuk
 * menyatakan itu.
 */
export function cariRekomendasiBelumAda({
	urutanBab,
	namaDokumen,
}: {
	urutanBab: number;
	/** Seluruh nama berkas di pustaka bab ini, **apa pun statusnya**. */
	namaDokumen: readonly string[];
}): RekomendasiBukti[] {
	const indikator = new Set(findKriteriaForBab(urutanBab).map((k) => k.no));
	if (indikator.size === 0) return [];

	const pustaka = namaDokumen.map(normalkan);

	return KATALOG_KEBUTUHAN_BUKTI.filter((kebutuhan) => {
		const dipakaiBab = kebutuhan.indikatorNo.filter((no) => indikator.has(no));
		return dipakaiBab.length > 0 && !sudahTerpenuhi(kebutuhan, pustaka);
	})
		.sort((a, b) => {
			// Yang bersandar tabel LKPS naik ke atas: itulah yang tidak akan membaik
			// seberapa pun narasinya ditambah, jadi ia yang harus selalu terlihat
			// walau sisanya terlipat.
			if (a.dariTabelLkps !== b.dariTabelLkps) {
				return a.dariTabelLkps ? -1 : 1;
			}
			return a.indikatorNo[0] - b.indikatorNo[0];
		})
		.map((kebutuhan) => ({
			kunci: kebutuhan.kunci,
			nama: kebutuhan.nama,
			jejak: `${kodeUntukBab(kebutuhan, indikator)} · ${kebutuhan.untuk}`,
		}));
}

/** Kode kriteria yang dilayani sebuah kebutuhan di bab ini, unik dan terurut. */
function kodeUntukBab(
	kebutuhan: KebutuhanBukti,
	indikator: ReadonlySet<number>,
): string {
	const kode = kebutuhan.indikatorNo
		.filter((no) => indikator.has(no))
		.map((no) => findKriteriaByNo(no)?.kodeKriteria)
		.filter((nilai): nilai is string => nilai !== undefined);

	return [...new Set(kode)].sort().join(' · ');
}
