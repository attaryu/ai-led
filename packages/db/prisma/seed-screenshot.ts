/**
 * Seed demo untuk screenshot UI: delapan lebih prodi dengan keadaan akreditasi
 * dan penyusunan yang berbeda-beda, supaya setiap blok Dashboard Utama punya isi.
 * Hanya menulis ke DB — tidak memanggil AI sama sekali.
 *
 * Idempotent: semua id berawalan `ss-` (kecuali `demo-*` milik seed.ts) dan
 * ditulis lewat upsert. Tanggal dihitung relatif terhadap hari ini, jadi
 * "mendekati", "kedaluwarsa", dan "lewat tenggat" tetap benar kapan pun dijalankan.
 *
 * Jalankan: npx ts-node prisma/seed-screenshot.ts   (dari packages/db)
 * Prasyarat: seed.ts sudah dijalankan atau demo-tenant/demo-set sudah ada.
 */
import {
	AssessmentStatus,
	EvidenceKind,
	Jenjang,
	OwnerTipe,
	PeringkatAkreditasi,
	PrismaClient,
	Role,
	RubricScoreType,
	StatusDokumen,
	StatusEkstraksi,
	SumberDraft,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Password123!';
const TENANT_ID = 'demo-tenant';
const SET_ID = 'demo-set';
const DAY = 24 * 60 * 60 * 1000;

/** Tanggal (tanpa jam) `n` hari dari hari ini; negatif = sudah lewat. */
function inDays(n: number): Date {
	const d = new Date(Date.now() + n * DAY);
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function ago(days: number, hour = 9): Date {
	const d = new Date(Date.now() - days * DAY);
	d.setHours(hour, 0, 0, 0);
	return d;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function put(delegate: any, id: string, data: Record<string, unknown>) {
	return delegate.upsert({ where: { id }, update: data, create: { id, ...data } });
}

// ───────────────────────────── Prodi ─────────────────────────────

type ProdiSeed = {
	id: string;
	name: string;
	code: string;
	level: Jenjang;
	faculty: string;
	head: string;
	rank: PeringkatAkreditasi;
	validUntilDays: number | null;
	decree: string | null;
};

const PRODI: ProdiSeed[] = [
	{
		id: 'demo-prodi',
		name: 'Teknik Informatika',
		code: '55201',
		level: Jenjang.S1,
		faculty: 'Fakultas Teknik',
		head: 'Dr. Andi Nugroho, S.T., M.Kom.',
		rank: PeringkatAkreditasi.BAIK_SEKALI,
		validUntilDays: 150,
		decree: '412/SK/LAM-TEKNIK/AK/Ak/IV/2022',
	},
	{
		id: 'ss-prodi-si',
		name: 'Sistem Informasi',
		code: '57201',
		level: Jenjang.S1,
		faculty: 'Fakultas Teknik',
		head: 'Dr. Rina Kusumawardani, S.Kom., M.T.',
		rank: PeringkatAkreditasi.UNGGUL,
		validUntilDays: 900,
		decree: '188/SK/LAM-TEKNIK/AK/Ak/VII/2025',
	},
	{
		id: 'ss-prodi-elektro',
		name: 'Teknik Elektro',
		code: '20201',
		level: Jenjang.S1,
		faculty: 'Fakultas Teknik',
		head: 'Ir. Hendra Wijaya, M.T., Ph.D.',
		rank: PeringkatAkreditasi.BAIK,
		validUntilDays: -60,
		decree: '097/SK/LAM-TEKNIK/AK/Ak/VIII/2021',
	},
	{
		id: 'ss-prodi-sipil',
		name: 'Teknik Sipil',
		code: '22201',
		level: Jenjang.S1,
		faculty: 'Fakultas Teknik',
		head: 'Prof. Dr. Ir. Budi Santoso, M.Sc.',
		rank: PeringkatAkreditasi.BAIK_SEKALI,
		validUntilDays: 95,
		decree: '301/SK/LAM-TEKNIK/AK/Ak/I/2022',
	},
	{
		id: 'ss-prodi-mesin',
		name: 'Teknik Mesin',
		code: '21401',
		level: Jenjang.D3,
		faculty: 'Fakultas Vokasi',
		head: 'Agus Prasetyo, S.T., M.T.',
		rank: PeringkatAkreditasi.BAIK,
		validUntilDays: 700,
		decree: '233/SK/LAM-TEKNIK/AK/Ak/V/2025',
	},
	{
		id: 'ss-prodi-manajemen',
		name: 'Manajemen',
		code: '61201',
		level: Jenjang.S1,
		faculty: 'Fakultas Ekonomi dan Bisnis',
		head: 'Dr. Maya Anggraeni, S.E., M.M.',
		rank: PeringkatAkreditasi.BAIK_SEKALI,
		validUntilDays: 1100,
		decree: '150/SK/BAN-PT/Ak-PPJ/S/VI/2025',
	},
	{
		id: 'ss-prodi-mti',
		name: 'Magister Teknik Informatika',
		code: '55101',
		level: Jenjang.S2,
		faculty: 'Fakultas Teknik',
		head: 'Prof. Dr. Siti Nurhaliza, M.Kom.',
		rank: PeringkatAkreditasi.BAIK_SEKALI,
		validUntilDays: 1300,
		decree: '077/SK/LAM-TEKNIK/AK/Ak/II/2026',
	},
	{
		id: 'ss-prodi-arsitektur',
		name: 'Arsitektur',
		code: '23201',
		level: Jenjang.S1,
		faculty: 'Fakultas Teknik',
		head: 'Dr. Ir. Dian Permatasari, M.Ars.',
		rank: PeringkatAkreditasi.BELUM_TERAKREDITASI,
		validUntilDays: null,
		decree: null,
	},
	{
		id: 'ss-prodi-kimia',
		name: 'Teknik Kimia',
		code: '24201',
		level: Jenjang.S1,
		faculty: 'Fakultas Teknik',
		head: 'Dr. Ir. Fajar Ramadhan, M.T.',
		rank: PeringkatAkreditasi.UNGGUL,
		validUntilDays: 1500,
		decree: '019/SK/LAM-TEKNIK/AK/Ak/XI/2025',
	},
];

// ───────────────────────────── Pengguna ─────────────────────────────

type UserSeed = {
	key: string;
	email: string;
	fullName: string;
	role: Role;
	prodiId?: string;
};

const USERS: UserSeed[] = [
	{ key: 'admin', email: 'admin@demo.test', fullName: 'Dewi Lestari (Admin)', role: Role.ADMIN },
	{
		key: 'pimpinan',
		email: 'pimpinan@demo.test',
		fullName: 'Prof. Dr. Ir. H. Bambang (Pimpinan)',
		role: Role.PIMPINAN,
	},
	{
		key: 'pm',
		email: 'pm@demo.test',
		fullName: 'Ahmad Fauzi (Penjamin Mutu)',
		role: Role.PENJAMIN_MUTU,
	},
	{
		key: 'ti',
		email: 'penyusun@demo.test',
		fullName: 'Siti Rahmawati (Penyusun)',
		role: Role.PENYUSUN,
		prodiId: 'demo-prodi',
	},
	{
		key: 'si',
		email: 'penyusun.si@demo.test',
		fullName: 'Rizky Pratama',
		role: Role.PENYUSUN,
		prodiId: 'ss-prodi-si',
	},
	{
		key: 'si2',
		email: 'penyusun.si2@demo.test',
		fullName: 'Nadia Putri Handayani',
		role: Role.PENYUSUN,
		prodiId: 'ss-prodi-si',
	},
	{
		key: 'mesin',
		email: 'penyusun.mesin@demo.test',
		fullName: 'Yoga Aditya',
		role: Role.PENYUSUN,
		prodiId: 'ss-prodi-mesin',
	},
	{
		key: 'manajemen',
		email: 'penyusun.manajemen@demo.test',
		fullName: 'Laras Wulandari',
		role: Role.PENYUSUN,
		prodiId: 'ss-prodi-manajemen',
	},
	{
		key: 'kimia',
		email: 'penyusun.kimia@demo.test',
		fullName: 'Dimas Saputra',
		role: Role.PENYUSUN,
		prodiId: 'ss-prodi-kimia',
	},
];

// ───────────────────────────── Dokumen LED ─────────────────────────────

type ChapterState = 'TERKUNCI' | 'MENUNGGU_REVIEW' | 'SEDANG_DISUSUN' | 'BELUM_DIISI';

type DocSeed = {
	id: string;
	prodiId: string;
	userKey: string;
	title: string;
	year: string;
	status: StatusDokumen;
	deadlineDays: number | null;
	createdDaysAgo: number;
	states: ChapterState[];
	/** Pakai bab yang sudah ada di DB (demo-led) alih-alih membuat ulang bab 1. */
	keepChapter1?: boolean;
	sections?: boolean;
};

const DOCS: DocSeed[] = [
	{
		id: 'demo-led',
		prodiId: 'demo-prodi',
		userKey: 'ti',
		title: 'Laporan Evaluasi Diri Teknik Informatika 2026',
		year: '2025/2026',
		status: StatusDokumen.REVIEW,
		deadlineDays: 21,
		createdDaysAgo: 60,
		states: ['SEDANG_DISUSUN', 'TERKUNCI', 'MENUNGGU_REVIEW', 'SEDANG_DISUSUN', 'BELUM_DIISI'],
		keepChapter1: true,
		sections: true,
	},
	{
		id: 'ss-led-ti-2024',
		prodiId: 'demo-prodi',
		userKey: 'ti',
		title: 'Laporan Evaluasi Diri Teknik Informatika 2025',
		year: '2024/2025',
		status: StatusDokumen.SELESAI,
		deadlineDays: -200,
		createdDaysAgo: 420,
		states: ['TERKUNCI', 'TERKUNCI', 'TERKUNCI', 'TERKUNCI', 'TERKUNCI'],
	},
	{
		id: 'ss-led-si',
		prodiId: 'ss-prodi-si',
		userKey: 'si',
		title: 'Laporan Evaluasi Diri Sistem Informasi 2026',
		year: '2025/2026',
		status: StatusDokumen.DRAFT,
		deadlineDays: 75,
		createdDaysAgo: 45,
		states: ['TERKUNCI', 'MENUNGGU_REVIEW', 'SEDANG_DISUSUN', 'SEDANG_DISUSUN', 'BELUM_DIISI'],
		sections: true,
	},
	{
		id: 'ss-led-mesin',
		prodiId: 'ss-prodi-mesin',
		userKey: 'mesin',
		title: 'Laporan Evaluasi Diri Teknik Mesin D3 2026',
		year: '2025/2026',
		status: StatusDokumen.DRAFT,
		deadlineDays: -12,
		createdDaysAgo: 90,
		states: ['SEDANG_DISUSUN', 'BELUM_DIISI', 'BELUM_DIISI', 'BELUM_DIISI', 'BELUM_DIISI'],
	},
	{
		id: 'ss-led-manajemen',
		prodiId: 'ss-prodi-manajemen',
		userKey: 'manajemen',
		title: 'Laporan Evaluasi Diri Manajemen 2026',
		year: '2025/2026',
		status: StatusDokumen.DRAFT,
		deadlineDays: null,
		createdDaysAgo: 14,
		states: ['SEDANG_DISUSUN', 'SEDANG_DISUSUN', 'BELUM_DIISI', 'BELUM_DIISI', 'BELUM_DIISI'],
	},
	{
		id: 'ss-led-kimia-2024',
		prodiId: 'ss-prodi-kimia',
		userKey: 'kimia',
		title: 'Laporan Evaluasi Diri Teknik Kimia 2025',
		year: '2024/2025',
		status: StatusDokumen.SELESAI,
		deadlineDays: -150,
		createdDaysAgo: 380,
		states: ['TERKUNCI', 'TERKUNCI', 'TERKUNCI', 'TERKUNCI', 'TERKUNCI'],
	},
];

const CHAPTER_TITLES = [
	'Bab I Pendahuluan',
	'Bab II Profil Unit Pengelola Program Studi',
	'Bab III Analisis Kriteria Akreditasi',
	'Bab IV Analisis Capaian dan Strategi Peningkatan',
	'Bab V Penutup',
];

const CHAPTER_SECTIONS: [string, string][][] = [
	[
		['1.1', 'Latar Belakang Penyusunan'],
		['1.2', 'Tujuan dan Ruang Lingkup'],
	],
	[
		['2.1', 'Visi, Misi, Tujuan, dan Strategi'],
		['2.2', 'Struktur Organisasi dan Tata Kelola'],
	],
	[
		['3.1', 'Kriteria 1: Visi, Misi, Tujuan, dan Strategi'],
		['3.2', 'Kriteria 2: Sumber Daya Manusia'],
		['3.3', 'Kriteria 3: Mahasiswa dan Lulusan'],
	],
	[
		['4.1', 'Analisis Capaian Kinerja'],
		['4.2', 'Strategi dan Rencana Peningkatan'],
	],
	[['5.1', 'Kesimpulan dan Rencana Tindak Lanjut']],
];

function chapterBody(prodi: string, chapterIdx: number): string {
	const heading = CHAPTER_TITLES[chapterIdx];
	const paras = [
		[
			`Laporan ini disusun sebagai bagian dari evaluasi diri Program Studi ${prodi} menjelang siklus akreditasi berikutnya. Penyusunan mengacu pada pedoman LAM Teknik dan memanfaatkan data LKPS tahun berjalan.`,
			`Proses penyusunan melibatkan unit penjaminan mutu, koordinator program studi, dan perwakilan dosen. Seluruh data kuantitatif ditarik dari sistem informasi akademik dan diverifikasi bersama gugus kendali mutu.`,
		],
		[
			`Program Studi ${prodi} berada di bawah koordinasi fakultas dengan struktur kepemimpinan yang terdiri atas ketua program studi, sekretaris, dan koordinator laboratorium. Pembagian tugas diatur melalui surat keputusan dekan yang ditinjau setiap tahun.`,
			`Visi program studi dijabarkan ke dalam misi, tujuan, dan strategi yang terukur. Pencapaian tiap sasaran dipantau dalam rapat tinjauan manajemen setiap semester dan didokumentasikan dalam notulen resmi.`,
		],
		[
			`Hasil analisis menunjukkan bahwa sebagian besar indikator kriteria berada pada level baik, dengan catatan pada kualifikasi akademik dosen dan keterlibatan pemangku kepentingan dalam peninjauan kurikulum.`,
			`Data pendukung disajikan dalam bentuk tabel LKPS dan dilengkapi bukti dukung berupa SK, laporan kinerja, dan notulen rapat. Tiap pernyataan dirujuk ke dokumen sumber agar dapat ditelusuri oleh asesor.`,
		],
		[
			`Capaian kinerja tiga tahun terakhir menunjukkan tren positif pada masa tunggu lulusan dan kepuasan pengguna. Kesenjangan terbesar tercatat pada jumlah publikasi terindeks per dosen tetap.`,
			`Strategi peningkatan difokuskan pada penguatan kolaborasi riset, pendampingan publikasi, dan pemutakhiran kurikulum berbasis capaian pembelajaran lulusan.`,
		],
		[
			`Secara keseluruhan program studi telah memenuhi sebagian besar persyaratan akreditasi. Rencana tindak lanjut disusun dengan penanggung jawab dan tenggat yang jelas.`,
			`Evaluasi atas pelaksanaan rencana tindak lanjut akan dilaporkan pada rapat tinjauan manajemen berikutnya.`,
		],
	][chapterIdx];
	return `<h2>${heading}</h2>${paras.map((p) => `<p>${p}</p>`).join('')}`;
}

// ───────────────────────────── Rubrik & penilaian ─────────────────────────────

type CriterionSeed = {
	id: string;
	no: number;
	code: string;
	group: string;
	desc: string;
	type: RubricScoreType;
	refs: string[];
	formula?: string;
	chapter: number;
};

const NEW_CRITERIA: CriterionSeed[] = [
	{
		id: 'ss-kr-4',
		no: 4,
		code: 'C2',
		group: 'Sumber Daya Manusia',
		desc: 'Kualifikasi akademik dosen tetap, mencakup pendidikan S3 dan jabatan akademik Lektor Kepala atau Guru Besar.',
		type: RubricScoreType.KUALITATIF,
		refs: ['LKPS 2.a'],
		chapter: 3,
	},
	{
		id: 'ss-kr-5',
		no: 5,
		code: 'C3',
		group: 'Mahasiswa dan Lulusan',
		desc: 'Persentase lulusan yang memperoleh pekerjaan dalam waktu enam bulan setelah kelulusan.',
		type: RubricScoreType.KUANTITATIF,
		refs: ['LKPS 3.b'],
		formula: 'Skor = 4 jika PL ≥ 90%; 3 jika 70% ≤ PL < 90%; 2 jika 50% ≤ PL < 70%; 1 jika PL < 50%.',
		chapter: 3,
	},
	{
		id: 'ss-kr-6',
		no: 6,
		code: 'C3',
		group: 'Mahasiswa dan Lulusan',
		desc: 'Mekanisme umpan balik dari lulusan dan pengguna lulusan serta pemanfaatannya untuk perbaikan program.',
		type: RubricScoreType.KUALITATIF,
		refs: ['LKPS 3.c'],
		chapter: 3,
	},
	{
		id: 'ss-kr-7',
		no: 7,
		code: 'C4',
		group: 'Kurikulum dan Pembelajaran',
		desc: 'Kesesuaian kurikulum dengan capaian pembelajaran lulusan dan kebutuhan pemangku kepentingan.',
		type: RubricScoreType.KUALITATIF,
		refs: ['LKPS 4.a'],
		chapter: 4,
	},
	{
		id: 'ss-kr-8',
		no: 8,
		code: 'C4',
		group: 'Penelitian',
		desc: 'Jumlah publikasi terindeks per dosen tetap dalam tiga tahun terakhir.',
		type: RubricScoreType.KUANTITATIF,
		refs: ['LKPS 4.d'],
		formula: 'Skor = 4 jika RP ≥ 1,5; 3 jika 1,0 ≤ RP < 1,5; 2 jika 0,5 ≤ RP < 1,0; 1 jika RP < 0,5.',
		chapter: 4,
	},
	{
		id: 'ss-kr-9',
		no: 9,
		code: 'C5',
		group: 'Penjaminan Mutu',
		desc: 'Sistem penjaminan mutu internal dan penerapan siklus PPEPP di tingkat program studi.',
		type: RubricScoreType.KUALITATIF,
		refs: [],
		chapter: 4,
	},
	{
		id: 'ss-kr-10',
		no: 10,
		code: 'C5',
		group: 'Penjaminan Mutu',
		desc: 'Pemanfaatan hasil audit mutu internal untuk perbaikan berkelanjutan.',
		type: RubricScoreType.KUALITATIF,
		refs: [],
		chapter: 5,
	},
];

const LEVEL_TEXT = [
	'Tidak ada bukti pelaksanaan.',
	'Dilaksanakan sebagian, tanpa dokumentasi yang memadai.',
	'Dilaksanakan dan terdokumentasi, belum dievaluasi secara berkala.',
	'Dilaksanakan, terdokumentasi, dan dievaluasi secara berkala.',
	'Dilaksanakan konsisten, dievaluasi, dan hasilnya menjadi dasar perbaikan yang terukur.',
];

const ALL_INDICATORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SCORES_TI = [3.5, 3, 2.75, 3, 4, 2, 3.25, 1.5, 3, 2.5];
const SCORES_SI = [4, 3.5, 3.25, 3.75, 3.5, 3, 3.5, 2.75, 3.5, 3];

const JUSTIFICATIONS = [
	'Visi, misi, tujuan, dan strategi tertuang jelas dalam dokumen dan dijabarkan ke dalam sasaran yang dapat diukur. Bukti sosialisasi kepada sivitas akademika tersedia.',
	'Pemangku kepentingan internal dan eksternal terlibat dalam penyusunan melalui lokakarya tahunan; notulen dan daftar hadir tersedia sebagai bukti.',
	'Rasio dosen tetap terhadap mahasiswa memenuhi ambang batas, namun distribusi beban kerja antar dosen belum merata.',
	'Sebagian besar dosen tetap berpendidikan S3, tetapi proporsi Lektor Kepala dan Guru Besar masih di bawah target program studi.',
	'Data pelacakan lulusan menunjukkan mayoritas lulusan terserap kurang dari enam bulan; metode pelacakan terdokumentasi.',
	'Mekanisme umpan balik ada, tetapi pemanfaatan hasilnya untuk perubahan kurikulum belum dicatat secara sistematis.',
	'Kurikulum telah dipetakan ke capaian pembelajaran lulusan dan ditinjau bersama mitra industri pada siklus terakhir.',
	'Jumlah publikasi terindeks per dosen tetap masih rendah dibandingkan target; sebagian besar luaran berupa prosiding nasional.',
	'Siklus PPEPP berjalan dengan dokumentasi lengkap pada tahap penetapan dan pelaksanaan; tahap peningkatan belum konsisten.',
	'Temuan audit mutu internal ditindaklanjuti, tetapi tenggat dan penanggung jawab belum seragam di seluruh unit.',
];

const RECOMMENDATIONS = [
	'Pertahankan proses sosialisasi dan lampirkan bukti terbaru.',
	'Dokumentasikan hasil lokakarya dalam laporan ringkas tahunan.',
	'Susun peta beban kerja dosen per semester untuk pemerataan.',
	'Dorong dosen berpendidikan S3 menempuh jabatan fungsional lebih tinggi.',
	'Lengkapi data pelacakan lulusan dengan bukti survei pengguna.',
	'Catat tindak lanjut umpan balik dalam notulen peninjauan kurikulum.',
	'Sertakan matriks pemetaan CPL ke mata kuliah sebagai lampiran.',
	'Bentuk kelompok riset dan sediakan pendampingan penulisan jurnal terindeks.',
	'Lengkapi dokumentasi tahap peningkatan siklus PPEPP.',
	'Seragamkan format tindak lanjut audit beserta tenggat dan penanggung jawab.',
];

// ───────────────────────────── Bukti dukung ─────────────────────────────

type EvidenceSeed = {
	id: string;
	name: string;
	ext: string;
	sizeKb: number;
	status: StatusEkstraksi;
	owner: 'tenant' | string;
	folder?: string;
	uploader: string;
	daysAgo: number;
	kind?: EvidenceKind;
	period?: string;
	failure?: string;
	tags?: number[];
};

const FOLDERS: { id: string; name: string; owner: 'tenant' | string; parent?: string }[] = [
	{ id: 'ss-fld-institusi', name: 'Dokumen Institusi', owner: 'tenant' },
	{ id: 'ss-fld-mutu', name: 'Kebijakan dan SOP Mutu', owner: 'tenant' },
	{ id: 'ss-fld-sarana', name: 'Keuangan dan Sarana', owner: 'tenant' },
	{ id: 'ss-fld-ti-kurikulum', name: 'Kurikulum dan Pembelajaran', owner: 'demo-prodi' },
	{ id: 'ss-fld-ti-sdm', name: 'Sumber Daya Manusia', owner: 'demo-prodi' },
];

const EVIDENCE: EvidenceSeed[] = [
	{ id: 'ss-ev-statuta', name: 'Statuta Universitas Contoh 2023', ext: 'pdf', sizeKb: 2480, status: StatusEkstraksi.SIAP, owner: 'tenant', folder: 'ss-fld-institusi', uploader: 'pm', daysAgo: 120, tags: [1] },
	{ id: 'ss-ev-renstra', name: 'Rencana Strategis 2025-2029', ext: 'pdf', sizeKb: 3120, status: StatusEkstraksi.SIAP, owner: 'tenant', folder: 'ss-fld-institusi', uploader: 'pm', daysAgo: 118, tags: [1, 2] },
	{ id: 'ss-ev-sk-visi', name: 'SK Rektor tentang Visi dan Misi', ext: 'pdf', sizeKb: 640, status: StatusEkstraksi.SIAP, owner: 'tenant', folder: 'ss-fld-institusi', uploader: 'pm', daysAgo: 118, tags: [1] },
	{ id: 'ss-ev-pedoman-mutu', name: 'Pedoman Sistem Penjaminan Mutu Internal', ext: 'pdf', sizeKb: 1850, status: StatusEkstraksi.SIAP, owner: 'tenant', folder: 'ss-fld-mutu', uploader: 'pm', daysAgo: 90, tags: [9] },
	{ id: 'ss-ev-sop-ami', name: 'SOP Audit Mutu Internal', ext: 'docx', sizeKb: 420, status: StatusEkstraksi.SIAP, owner: 'tenant', folder: 'ss-fld-mutu', uploader: 'pm', daysAgo: 90, tags: [9, 10] },
	{ id: 'ss-ev-laporan-ami', name: 'Laporan Audit Mutu Internal 2025', ext: 'pdf', sizeKb: 2210, status: StatusEkstraksi.DIPROSES, owner: 'tenant', folder: 'ss-fld-mutu', uploader: 'pm', daysAgo: 2, tags: [10] },
	{ id: 'ss-ev-keuangan', name: 'Laporan Keuangan Audit 2024', ext: 'pdf', sizeKb: 5300, status: StatusEkstraksi.SIAP, owner: 'tenant', folder: 'ss-fld-sarana', uploader: 'pm', daysAgo: 60 },
	{ id: 'ss-ev-sarana', name: 'Daftar Aset dan Sarana Prasarana', ext: 'xlsx', sizeKb: 780, status: StatusEkstraksi.GAGAL, owner: 'tenant', folder: 'ss-fld-sarana', uploader: 'pm', daysAgo: 30, failure: 'Berkas tidak memiliki teks yang dapat diekstrak (halaman berupa gambar pindaian).' },
	{ id: 'ss-ev-tracer', name: 'Laporan Tracer Study Universitas 2025', ext: 'pdf', sizeKb: 1640, status: StatusEkstraksi.MENUNGGU, owner: 'tenant', uploader: 'pm', daysAgo: 0, tags: [5, 6] },
	{ id: 'ss-ev-ti-kurikulum', name: 'Dokumen Kurikulum OBE Teknik Informatika 2024', ext: 'pdf', sizeKb: 4120, status: StatusEkstraksi.SIAP, owner: 'demo-prodi', folder: 'ss-fld-ti-kurikulum', uploader: 'ti', daysAgo: 70, tags: [7] },
	{ id: 'ss-ev-ti-cpl', name: 'Matriks Pemetaan CPL dan Mata Kuliah', ext: 'xlsx', sizeKb: 360, status: StatusEkstraksi.SIAP, owner: 'demo-prodi', folder: 'ss-fld-ti-kurikulum', uploader: 'ti', daysAgo: 70, tags: [7] },
	{ id: 'ss-ev-ti-rps', name: 'Kumpulan RPS Semester Ganjil 2025', ext: 'pdf', sizeKb: 6800, status: StatusEkstraksi.SIAP, owner: 'demo-prodi', folder: 'ss-fld-ti-kurikulum', uploader: 'ti', daysAgo: 55 },
	{ id: 'ss-ev-ti-dosen', name: 'Daftar Dosen Tetap dan Kualifikasi Akademik', ext: 'pdf', sizeKb: 910, status: StatusEkstraksi.SIAP, owner: 'demo-prodi', folder: 'ss-fld-ti-sdm', uploader: 'ti', daysAgo: 50, tags: [3, 4] },
	{ id: 'ss-ev-ti-publikasi', name: 'Rekap Publikasi Dosen 2023-2025', ext: 'xlsx', sizeKb: 540, status: StatusEkstraksi.SIAP, owner: 'demo-prodi', folder: 'ss-fld-ti-sdm', uploader: 'ti', daysAgo: 40, tags: [8] },
	{ id: 'ss-ev-ti-mou', name: 'Perjanjian Kerja Sama dengan Mitra Industri', ext: 'pdf', sizeKb: 1320, status: StatusEkstraksi.SIAP, owner: 'demo-prodi', uploader: 'ti', daysAgo: 35, tags: [2, 6] },
	{ id: 'ss-ev-ti-lkps', name: 'LKPS Teknik Informatika TS 2025', ext: 'xlsx', sizeKb: 1120, status: StatusEkstraksi.SIAP, owner: 'demo-prodi', uploader: 'ti', daysAgo: 25, kind: EvidenceKind.LKPS, period: 'TS 2025' },
	{ id: 'ss-ev-ti-lkps-2024', name: 'LKPS Teknik Informatika TS 2024', ext: 'xlsx', sizeKb: 1090, status: StatusEkstraksi.SIAP, owner: 'demo-prodi', uploader: 'ti', daysAgo: 400, kind: EvidenceKind.LKPS, period: 'TS 2024' },
	{ id: 'ss-ev-si-kurikulum', name: 'Dokumen Kurikulum Sistem Informasi 2024', ext: 'pdf', sizeKb: 3870, status: StatusEkstraksi.SIAP, owner: 'ss-prodi-si', uploader: 'si', daysAgo: 45, tags: [7] },
	{ id: 'ss-ev-si-tracer', name: 'Hasil Tracer Study Sistem Informasi', ext: 'pdf', sizeKb: 980, status: StatusEkstraksi.SIAP, owner: 'ss-prodi-si', uploader: 'si', daysAgo: 40, tags: [5] },
	{ id: 'ss-ev-si-lkps', name: 'LKPS Sistem Informasi TS 2025', ext: 'xlsx', sizeKb: 1060, status: StatusEkstraksi.SIAP, owner: 'ss-prodi-si', uploader: 'si', daysAgo: 20, kind: EvidenceKind.LKPS, period: 'TS 2025' },
];

// ───────────────────────────── Eksekusi ─────────────────────────────

async function main() {
	const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
	const set = await prisma.accreditationSet.findUnique({ where: { id: SET_ID } });
	if (!tenant || !set) {
		throw new Error(`"${TENANT_ID}" atau "${SET_ID}" belum ada. Jalankan seed.ts lebih dulu.`);
	}

	const passwordHash = await bcrypt.hash(PASSWORD, 10);

	// Prodi — update ikut menimpa peringkat/masa berlaku supaya demo-prodi
	// (dibuat seed.ts tanpa masa berlaku) ikut berubah.
	for (const p of PRODI) {
		const data = {
			tenantId: TENANT_ID,
			name: p.name,
			code: p.code,
			level: p.level,
			faculty: p.faculty,
			programHead: p.head,
			accreditationRank: p.rank,
			accreditationDecreeNumber: p.decree,
			accreditationValidUntil: p.validUntilDays === null ? null : inDays(p.validUntilDays),
		};
		await put(prisma.studyProgram, p.id, data);
	}

	// Pengguna — kunci upsert-nya email (unik), id akun lama dibiarkan.
	const users: Record<string, { id: string; fullName: string }> = {};
	for (const u of USERS) {
		const row = await prisma.user.upsert({
			where: { email: u.email },
			update: { fullName: u.fullName, role: u.role, studyProgramId: u.prodiId ?? null },
			create: {
				tenantId: TENANT_ID,
				studyProgramId: u.prodiId ?? null,
				fullName: u.fullName,
				email: u.email,
				passwordHash,
				role: u.role,
			},
		});
		users[u.key] = { id: row.id, fullName: row.fullName };
	}

	// Rubrik: tujuh indikator tambahan di set yang sama, lengkap dengan level
	// 0–4 dan pemetaan ke bab.
	for (const c of NEW_CRITERIA) {
		await put(prisma.rubricCriterion, c.id, {
			accreditationSetId: SET_ID,
			indicatorNo: c.no,
			criterionCode: c.code,
			criterionGroup: c.group,
			description: c.desc,
			scoreType: c.type,
			lkpsTableRefs: c.refs,
			formula: c.formula ?? null,
		});
		for (let score = 0; score <= 4; score++) {
			await prisma.rubricLevel.upsert({
				where: { criterionId_score: { criterionId: c.id, score } },
				update: { description: LEVEL_TEXT[score] },
				create: { criterionId: c.id, score, description: LEVEL_TEXT[score] },
			});
		}
		await prisma.rubricCriterionChapter.createMany({
			data: [{ criterionId: c.id, chapterOrder: c.chapter }],
			skipDuplicates: true,
		});
	}

	// Dokumen LED, bab, sub-bab, dan riwayat versi.
	for (const d of DOCS) {
		const prodi = PRODI.find((p) => p.id === d.prodiId)!;
		const author = users[d.userKey];

		await put(prisma.ledDocument, d.id, {
			studyProgramId: d.prodiId,
			title: d.title,
			academicYear: d.year,
			overallStatus: d.status,
			deadline: d.deadlineDays === null ? null : inDays(d.deadlineDays),
			accreditationSetId: SET_ID,
			createdAt: ago(d.createdDaysAgo),
		});

		for (let i = 0; i < 5; i++) {
			if (i === 0 && d.keepChapter1) continue;
			const state = d.states[i];
			const chapterId = `${d.id}-bab-${i + 1}`;
			const filled = state !== 'BELUM_DIISI';
			const content = filled
				? { format: 'html', body: chapterBody(prodi.name, i) }
				: {};
			const savedAt = ago(Math.max(1, 25 - i * 4));

			await put(prisma.documentChapter, chapterId, {
				documentId: d.id,
				chapterOrder: i + 1,
				chapterTitle: CHAPTER_TITLES[i],
				workingContent: content,
				locked: state === 'TERKUNCI',
				qualityAssuranceNote:
					state === 'TERKUNCI'
						? 'Isi bab sudah sesuai pedoman. Lanjutkan ke bab berikutnya.'
						: null,
				notedByName: state === 'TERKUNCI' ? users.pm.fullName : null,
				notedAt: state === 'TERKUNCI' ? ago(5) : null,
				reviewSubmittedAt: state === 'MENUNGGU_REVIEW' ? ago(2, 14) : null,
			});

			if (!filled) continue;

			// Riwayat versi: bab terkunci punya dua versi (AI lalu revisi manual).
			if (state === 'TERKUNCI' || state === 'MENUNGGU_REVIEW') {
				const v1 = await put(prisma.chapterDraft, `${chapterId}-v1`, {
					chapterId,
					createdByUserId: author.id,
					version: 1,
					label: 'Hasil generate awal',
					contentSnapshot: content,
					source: SumberDraft.AI,
					createdByName: author.fullName,
					createdAt: ago(18),
				});
				const v2 = await put(prisma.chapterDraft, `${chapterId}-v2`, {
					chapterId,
					createdByUserId: author.id,
					version: 2,
					label: 'Revisi setelah masukan Penjamin Mutu',
					contentSnapshot: content,
					source: SumberDraft.MANUAL,
					createdByName: author.fullName,
					createdAt: ago(8),
				});
				void v1;
				await prisma.documentChapter.update({
					where: { id: chapterId },
					data: { activeCheckpointId: v2.id },
				});
			}

			if (d.sections && i < 4) {
				const parents = CHAPTER_SECTIONS[i];
				for (let s = 0; s < parents.length; s++) {
					const [marker, title] = parents[s];
					await put(prisma.chapterSection, `${chapterId}-sec-${s + 1}`, {
						chapterId,
						order: s + 1,
						title,
						marker,
						guidance: `Uraikan ${title.toLowerCase()} berdasarkan data LKPS dan bukti dukung yang tersedia.`,
						status: 'GENERATED',
						content: {
							format: 'html',
							body: `<p>${prodi.name} menguraikan ${title.toLowerCase()} berdasarkan dokumen resmi program studi dan data LKPS tahun berjalan. Seluruh rujukan dapat ditelusuri ke bukti dukung yang diunggah.</p>`,
						},
						model: 'demo',
						generatedAt: ago(18),
						lkpsList: [],
					});
				}
			}
		}
	}

	// Folder dan bukti dukung.
	for (const f of FOLDERS) {
		const isTenant = f.owner === 'tenant';
		await put(prisma.evidenceFolder, f.id, {
			ownerType: isTenant ? OwnerTipe.TENANT : OwnerTipe.PROGRAM_STUDI,
			tenantId: isTenant ? TENANT_ID : null,
			studyProgramId: isTenant ? null : f.owner,
			name: f.name,
			parentId: f.parent ?? null,
			createdByUserId: users.pm.id,
			createdByName: users.pm.fullName,
		});
	}

	for (const e of EVIDENCE) {
		const isTenant = e.owner === 'tenant';
		const uploader = users[e.uploader];
		await put(prisma.evidence, e.id, {
			ownerType: isTenant ? OwnerTipe.TENANT : OwnerTipe.PROGRAM_STUDI,
			kind: e.kind ?? EvidenceKind.BUKTI_DUKUNG,
			tenantId: isTenant ? TENANT_ID : null,
			studyProgramId: isTenant ? null : e.owner,
			documentName: e.name,
			fileUrl: `seed/${TENANT_ID}/${e.id}.${e.ext}`,
			fileType: e.ext,
			sizeBytes: e.sizeKb * 1024,
			extractionStatus: e.status,
			failureNote: e.failure ?? null,
			uploadedByUserId: uploader.id,
			uploadedByName: uploader.fullName,
			uploadedAt: ago(e.daysAgo),
			folderId: e.folder ?? null,
			period: e.period ?? null,
		});
		for (const no of e.tags ?? []) {
			await prisma.evidenceIndicatorTag.upsert({
				where: {
					evidenceId_accreditationSetId_indicatorNo: {
						evidenceId: e.id,
						accreditationSetId: SET_ID,
						indicatorNo: no,
					},
				},
				update: {},
				create: { evidenceId: e.id, accreditationSetId: SET_ID, indicatorNo: no },
			});
		}
	}

	// Penilaian AMI selesai untuk dokumen TI dan SI.
	const sessions = [
		{ id: 'ss-sesi-ti', docId: 'demo-led', scores: SCORES_TI, userKey: 'pm', failed: [] as number[] },
		{ id: 'ss-sesi-si', docId: 'ss-led-si', scores: SCORES_SI, userKey: 'pm', failed: [8] },
	];

	for (const s of sessions) {
		await put(prisma.assessmentSession, s.id, {
			tenantId: TENANT_ID,
			documentId: s.docId,
			createdByUserId: users[s.userKey].id,
			ledSource: 'EDITOR',
			totalIndicators: ALL_INDICATORS.length,
			completedIndicators: ALL_INDICATORS.length,
			status: AssessmentStatus.COMPLETED,
			createdAt: ago(3),
		});

		for (const no of ALL_INDICATORS) {
			const failed = s.failed.includes(no);
			const idx = no - 1;
			await prisma.indicatorResult.upsert({
				where: { sessionId_indicatorNo_subNo: { sessionId: s.id, indicatorNo: no, subNo: '' } },
				update: {},
				create: {
					sessionId: s.id,
					indicatorNo: no,
					subNo: '',
					score: failed ? null : s.scores[idx],
					justification: failed ? null : JUSTIFICATIONS[idx],
					confidence: failed ? null : [0.91, 0.84, 0.77, 0.88, 0.95, 0.69, 0.82, 0.74, 0.86, 0.71][idx],
					recommendation: failed ? null : RECOMMENDATIONS[idx],
					model: failed ? null : 'qwen3:14b',
					error: failed ? 'Model tidak merespons dalam batas waktu. Jalankan ulang indikator ini.' : null,
				},
			});
			if (failed) continue;
			for (let step = 0; step < 3; step++) {
				await put(prisma.reasoningStep, `${s.id}-rs-${no}-${step}`, {
					sessionId: s.id,
					indicatorNo: no,
					subNo: '',
					stepIndex: step,
					content: [
						`Membaca deskripsi indikator ${no} dan level rubrik yang berlaku.`,
						'Mencari bukti pendukung pada LED, LKPS, dan bukti dukung yang ditandai untuk indikator ini.',
						`Mencocokkan temuan dengan level rubrik dan menetapkan skor ${s.scores[idx]}.`,
					][step],
				});
			}
		}
	}

	// Keputusan Penjamin Mutu atas sebagian indikator dokumen TI: tiga disetujui
	// apa adanya, dua dikoreksi dengan catatan.
	const verdicts: [number, number, string | null][] = [
		[1, 3.5, null],
		[2, 3, null],
		[3, 2.75, null],
		[6, 2.5, 'Umpan balik alumni sudah masuk notulen peninjauan kurikulum 2025; naikkan satu tingkat.'],
		[8, 1.5, null],
	];
	for (const [no, final, note] of verdicts) {
		const machine = SCORES_TI[no - 1];
		await prisma.assessmentVerdict.upsert({
			where: { documentId_indicatorNo_subNo: { documentId: 'demo-led', indicatorNo: no, subNo: '' } },
			update: {},
			create: {
				documentId: 'demo-led',
				indicatorNo: no,
				subNo: '',
				finalScore: final,
				note,
				machineScoreAtReview: machine,
				sessionIdAtReview: 'ss-sesi-ti',
				reviewedByUserId: users.pm.id,
				reviewedByName: users.pm.fullName,
			},
		});
	}

	console.log('Seed screenshot selesai.');
	console.log(`  Prodi: ${PRODI.length}, dokumen LED: ${DOCS.length}, bukti dukung: ${EVIDENCE.length}`);
	console.log(`  Password semua akun: ${PASSWORD}`);
	for (const u of USERS) console.log(`  ${u.role.padEnd(14)} ${u.email}`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
