import { z } from 'zod';

import { type BuktiDukungRef } from '../../domain/entities/bukti-dukung-ref.entity';
import { type RagasScore } from '../../domain/entities/ragas-score.entity';
import {
	chapterSchema,
	type ChapterEntity,
} from '../../domain/entities/chapter.entity';
import { chapterLocalSource } from '../sources/local/chapter-local.source';
import { chapterDraftRepository } from './chapter-draft.repository';
import { chapterScoreRepository } from './chapter-score.repository';

/**
 * Struktur bab standar LED LAM-Teknik, dipakai sebagai cetakan setiap kali
 * Dokumen LED baru dibuat (docs/application_flow.md §7.3).
 *
 * Sengaja satu level mengikuti `BAB_DOKUMEN.urutan_bab`; penjenjangan Daftar Isi
 * masih Pertanyaan Terbuka #2 (§16). Kalau daftar resminya ternyata berbeda,
 * cukup konstanta ini yang diubah — sisanya ikut.
 */
export const CHAPTER_TEMPLATE: { urutanBab: number; judulBab: string }[] = [
	{ urutanBab: 1, judulBab: 'Pendahuluan' },
	{ urutanBab: 2, judulBab: 'Kondisi Eksternal' },
	{ urutanBab: 3, judulBab: 'Profil Unit Pengelola Program Studi' },
	{ urutanBab: 4, judulBab: 'Kriteria 1 — Visi, Misi, Tujuan, dan Strategi' },
	{
		urutanBab: 5,
		judulBab: 'Kriteria 2 — Tata Pamong, Tata Kelola, dan Kerja Sama',
	},
	{ urutanBab: 6, judulBab: 'Kriteria 3 — Mahasiswa' },
	{ urutanBab: 7, judulBab: 'Kriteria 4 — Sumber Daya Manusia' },
	{ urutanBab: 8, judulBab: 'Kriteria 5 — Keuangan, Sarana, dan Prasarana' },
	{ urutanBab: 9, judulBab: 'Kriteria 6 — Pendidikan' },
	{ urutanBab: 10, judulBab: 'Kriteria 7 — Penelitian' },
	{ urutanBab: 11, judulBab: 'Kriteria 8 — Pengabdian kepada Masyarakat' },
	{ urutanBab: 12, judulBab: 'Kriteria 9 — Luaran dan Capaian Tridharma' },
	{
		urutanBab: 13,
		judulBab: 'Analisis dan Penetapan Program Pengembangan',
	},
	{ urutanBab: 14, judulBab: 'Penutup' },
];

function buildEmptyChapters(ledProjectId: string): ChapterEntity[] {
	return CHAPTER_TEMPLATE.map((bab) => ({
		id: `bab-${ledProjectId}-${bab.urutanBab}`,
		ledProjectId,
		urutanBab: bab.urutanBab,
		judulBab: bab.judulBab,
		kontenKerja: null,
		checkpointAktifId: null,
		terkunci: false,
		catatanPenjaminMutu: null,
		catatanOlehNama: null,
		catatanPada: null,
		diajukanReviewPada: null,
		terakhirDisimpan: null,
		buktiDukung: [],
		// Bab kosong belum pernah digenerate, jadi belum ada mutu jawaban AI yang
		// bisa dinilai. Sama untuk bab contoh yang isinya ditulis tangan di seed.
		ragas: null,
	}));
}

/**
 * Cuplikan seed `evidence.repository.ts`, hanya berkas yang dipakai seed bab di
 * bawah.
 *
 * Ditulis ulang di sini alih-alih mengimpor repository bukti dukung: seed ini
 * berjalan saat modul dimuat, dan menyeret repository fitur lain ke dalam jalur
 * itu membuat urutan inisialisasi keduanya saling bergantung. Kalau nama berkas
 * di sana berubah, yang di sini ikut disesuaikan — tapi itu data contoh yang
 * memang jarang bergerak.
 */
const BUKTI: Record<string, BuktiDukungRef> = {
	'ev-01': {
		id: 'ev-01',
		namaDokumen: 'Statuta_Universitas_2024.pdf',
		tipeFile: 'pdf',
	},
	'ev-02': {
		id: 'ev-02',
		namaDokumen: 'Renstra_Universitas_2025_2030.pdf',
		tipeFile: 'pdf',
	},
	'ev-04': {
		id: 'ev-04',
		namaDokumen: 'Pedoman_Akademik_Universitas.docx',
		tipeFile: 'docx',
	},
	'ev-12': {
		id: 'ev-12',
		namaDokumen: 'LKPS_Teknik_Informatika_2026.xlsx',
		tipeFile: 'xlsx',
	},
	'ev-13': {
		id: 'ev-13',
		namaDokumen: 'SK_Kurikulum_Prodi_TI.pdf',
		tipeFile: 'pdf',
	},
	'ev-14': {
		id: 'ev-14',
		namaDokumen: 'Daftar_Publikasi_Dosen_TI.xlsx',
		tipeFile: 'xlsx',
	},
	'ev-16': {
		id: 'ev-16',
		namaDokumen: 'LKPS_Sistem_Informasi_2026.xlsx',
		tipeFile: 'xlsx',
	},
	'ev-17': {
		id: 'ev-17',
		namaDokumen: 'Laporan_Kegiatan_Himpunan_SI.docx',
		tipeFile: 'docx',
	},
	'ev-18': {
		id: 'ev-18',
		namaDokumen: 'SK_Dosen_Pembimbing_TA_Elektro.pdf',
		tipeFile: 'pdf',
	},
};

function daysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function contohKonten(judulBab: string): string {
	return `Narasi ${judulBab} untuk keperluan pratinjau antarmuka.`;
}

/**
 * Kondisi awal tiap dokumen contoh, dibuat berbeda-beda supaya dashboard punya
 * sesuatu yang layak dilihat: dokumen 1 baru berjalan, dokumen 2 sedang direview
 * sebagian, dokumen 3 dan 4 sudah tuntas.
 */
const SEED_STATE: Record<
	string,
	{
		babTerisi: number;
		babTerkunci: number;
		/** `urutanBab` yang sedang diantrekan Penyusun untuk direview (§12.2). */
		diajukan?: number[];
		catatan?: Record<number, string>;
		terbengkalai?: number[];
		buktiDukung?: Record<number, BuktiDukungRef[]>;
	}
> = {
	'1': {
		babTerisi: 5,
		babTerkunci: 0,
		// Satu bab sudah diantrekan supaya keadaan ini terlihat di dashboard tanpa
		// perlu mengklik apa pun lebih dulu.
		diajukan: [4],
		catatan: {
			3: 'Profil UPPS masih memakai data tahun lalu, mohon diperbarui.',
		},
		terbengkalai: [2],
		buktiDukung: {
			1: [BUKTI['ev-01'], BUKTI['ev-02']],
			2: [BUKTI['ev-02']],
			4: [BUKTI['ev-01'], BUKTI['ev-12']],
			5: [BUKTI['ev-13'], BUKTI['ev-14']],
		},
	},
	'2': {
		babTerisi: 12,
		babTerkunci: 4,
		buktiDukung: {
			1: [BUKTI['ev-01']],
			3: [BUKTI['ev-16']],
			4: [BUKTI['ev-01'], BUKTI['ev-02']],
			6: [BUKTI['ev-17']],
			9: [BUKTI['ev-04']],
			12: [BUKTI['ev-16'], BUKTI['ev-17']],
		},
	},
	'3': {
		babTerisi: CHAPTER_TEMPLATE.length,
		babTerkunci: CHAPTER_TEMPLATE.length,
		buktiDukung: {
			1: [BUKTI['ev-01'], BUKTI['ev-02']],
			5: [BUKTI['ev-18']],
			10: [BUKTI['ev-18'], BUKTI['ev-04']],
		},
	},
	// Siklus lama Teknik Informatika, sudah tuntas — isi arsip di Dashboard Prodi.
	'4': {
		babTerisi: CHAPTER_TEMPLATE.length,
		babTerkunci: CHAPTER_TEMPLATE.length,
		buktiDukung: {
			1: [BUKTI['ev-01']],
			3: [BUKTI['ev-13']],
		},
	},
};

function buildSeededChapters(ledProjectId: string): ChapterEntity[] {
	const state = SEED_STATE[ledProjectId];
	const chapters = buildEmptyChapters(ledProjectId);
	if (!state) return chapters;

	return chapters.map((chapter) => {
		const terisi = chapter.urutanBab <= state.babTerisi;
		const terbengkalai = state.terbengkalai?.includes(chapter.urutanBab) ?? false;
		const catatan = state.catatan?.[chapter.urutanBab] ?? null;

		return {
			...chapter,
			kontenKerja: terisi ? contohKonten(chapter.judulBab) : null,
			terkunci: chapter.urutanBab <= state.babTerkunci,
			catatanPenjaminMutu: catatan,
			// Nama Penjamin Mutu di `session.repository.ts`, supaya atribusi di tab
			// Review menyebut orang yang memang ada di daftar user contoh.
			catatanOlehNama: catatan ? 'Ahmad Fauzi' : null,
			catatanPada: catatan ? daysAgo(1) : null,
			diajukanReviewPada: state.diajukan?.includes(chapter.urutanBab)
				? daysAgo(0.1)
				: null,
			terakhirDisimpan: terisi
				? terbengkalai
					? daysAgo(31)
					: daysAgo(chapter.urutanBab * 0.35)
				: null,
			buktiDukung: state.buktiDukung?.[chapter.urutanBab] ?? [],
		};
	});
}

const initialChapters: ChapterEntity[] = Object.keys(SEED_STATE).flatMap(
	buildSeededChapters,
);

export const chapterRepository = {
	/**
	 * Isi yang tersimpan **divalidasi**, bukan sekadar di-`JSON.parse` lalu
	 * dianggap `ChapterEntity[]`.
	 *
	 * Bukan kehati-hatian berlebih: bentuk barisnya sudah pernah berubah sekali
	 * (`buktiDukungIds: string[]` jadi `buktiDukung: BuktiDukungRef[]`), dan data
	 * bentuk lama **lolos `JSON.parse` tanpa melempar apa pun**. Yang terjadi
	 * kemudian bukan pesan galat yang jelas, melainkan `chapter.buktiDukung is not
	 * iterable` di kedalaman `summarizeChapters` — jauh dari penyebabnya, dan
	 * cukup untuk menjatuhkan seluruh halaman Dashboard.
	 *
	 * Menaikkan nomor key penyimpanan saja tidak cukup: itu hanya menolong halaman
	 * yang dimuat ulang seutuhnya, sedangkan pemuatan ulang sebagian — modul
	 * sumber lokal masih versi lama sementara entitasnya sudah baru — tetap
	 * membaca bentuk lama. Pemeriksaan di sini berlaku untuk semuanya, dan
	 * sekaligus membuat perubahan bentuk berikutnya tidak perlu mengarang nama key
	 * lagi.
	 */
	findAll(): ChapterEntity[] {
		const stored = chapterLocalSource.getAll();
		if (!stored) {
			this.save(initialChapters);
			return initialChapters;
		}

		try {
			const parsed = z.array(chapterSchema).safeParse(JSON.parse(stored));
			if (parsed.success) return parsed.data;
		} catch {
			// JSON-nya sendiri rusak; ditangani sama dengan bentuk yang tidak cocok.
		}

		this.save(initialChapters);
		return initialChapters;
	},

	save(chapters: ChapterEntity[]): void {
		chapterLocalSource.setAll(JSON.stringify(chapters));
	},

	/** Event yang sama dengan fitur lain supaya daftar yang terpasang ikut segar. */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	/**
	 * Materialisasi cetakan bab untuk satu Dokumen LED (§7.3). Aman dipanggil
	 * ulang: kalau babnya sudah ada, yang tersimpan itulah yang dikembalikan.
	 */
	createForProject(ledProjectId: string): ChapterEntity[] {
		const all = this.findAll();
		const existing = all.filter(
			(chapter) => chapter.ledProjectId === ledProjectId,
		);
		if (existing.length > 0) return existing;

		const created = buildEmptyChapters(ledProjectId);
		this.save([...all, ...created]);
		return created;
	},

	/**
	 * Bab satu dokumen, terurut `urutanBab`.
	 *
	 * Dokumen yang belum punya bab sama sekali — misal dibuat sebelum entitas ini
	 * ada — dibuatkan di sini juga, sehingga tidak perlu migrasi data lama di
	 * localStorage hanya untuk membuka dashboardnya.
	 */
	findByProjectId(ledProjectId: string): ChapterEntity[] {
		const owned = this.findAll().filter(
			(chapter) => chapter.ledProjectId === ledProjectId,
		);
		const chapters =
			owned.length > 0 ? owned : this.createForProject(ledProjectId);

		return [...chapters].sort((a, b) => a.urutanBab - b.urutanBab);
	},

	/**
	 * Satu bab, dibaca ulang dari penyimpanan.
	 *
	 * Dipakai saat isi bab yang **paling mutakhir** dibutuhkan di luar alur render
	 * — misal tepat sebelum checkpoint diambil, sesudah autosave disiram. Prop
	 * `chapter` yang beredar di komponen dibaca sekali saat render dan bisa
	 * tertinggal dari ketikan terakhir.
	 */
	findById(chapterId: string): ChapterEntity | undefined {
		return this.findAll().find((chapter) => chapter.id === chapterId);
	},

	/**
	 * Autosave Editor Bab: menimpa `kontenKerja` sekaligus mencap
	 * `terakhirDisimpan` (§7.2). Keduanya satu operasi karena stempel waktu tidak
	 * punya arti lepas dari isi yang menyebabkannya — pemanggil tidak boleh bisa
	 * memperbarui yang satu tanpa yang lain.
	 *
	 * Sengaja **tidak** memanggil `notify()`. Fungsi ini dipanggil berkali-kali
	 * per menit selama pengguna mengetik, sedangkan penyiarannya hanya berguna
	 * saat status bab berubah; menyiarkan tiap simpanan akan memaksa seluruh
	 * pelanggan `storage-update` membaca ulang localStorage tiap beberapa
	 * ketikan. `useChapterAutosave` yang memutuskan kapan menyiarkan.
	 *
	 * Bab `terkunci` ditolak diam-diam sebagai jaring pengaman terakhir §12.2:
	 * UI sudah mematikan editornya, tapi aturan itu tidak boleh hanya hidup di
	 * lapis tampilan — simpanan yang telanjur terjadwal saat bab dikunci dari tab
	 * lain harus ikut tertahan di sini.
	 *
	 * Mengembalikan barisnya yang terbaru (bukan `void`) supaya pemanggil dapat
	 * stempel waktu persisnya tanpa membaca ulang penyimpanan.
	 */
	updateKonten(
		chapterId: string,
		kontenKerja: string,
	): ChapterEntity | undefined {
		const all = this.findAll();
		const target = all.find((chapter) => chapter.id === chapterId);
		if (!target || target.terkunci) return undefined;

		const updated: ChapterEntity = {
			...target,
			kontenKerja,
			terakhirDisimpan: new Date().toISOString(),
		};
		this.save(
			all.map((chapter) => (chapter.id === chapterId ? updated : chapter)),
		);
		return updated;
	},

	/**
	 * Hasil generate AI (docs/application_flow.md §12.1): menimpa `kontenKerja`
	 * **sekaligus** mencatat ulang bukti dukung yang dipakai.
	 *
	 * Sengaja bukan perluasan {@link updateKonten}. Yang itu jalur autosave —
	 * dipanggil puluhan kali per menit dan karena itu dengan sadar tidak
	 * menyiarkan apa pun. Generate kebalikannya: jarang, dan sekali jalan ia
	 * mengubah dua fakta yang dibaca tampilan di luar editor — jumlah bukti
	 * dukung terpakai di KPI dashboard (`summarizeChapters`) dan status bab di
	 * Daftar Isi. Keduanya harus segar begitu generate selesai, jadi di sini
	 * `notify()` justru wajib.
	 *
	 * Isi dan daftar buktinya satu operasi karena §12.1 memang menuliskannya
	 * begitu: baris `BUKTI_DUKUNG_BAB` diperbarui mengikuti pilihan yang dipakai
	 * generate ini. Bab yang sudah lebih dulu terkunci ditolak diam-diam, sama
	 * seperti {@link updateKonten}.
	 */
	applyGenerate(
		chapterId: string,
		input: {
			kontenKerja: string;
			buktiDukung: BuktiDukungRef[];
			/** Tanpa `dihitungPada`: distempel di sini, lihat alasannya di bawah. */
			ragas: Omit<RagasScore, 'dihitungPada'>;
		},
	): ChapterEntity | undefined {
		const all = this.findAll();
		const target = all.find((chapter) => chapter.id === chapterId);
		if (!target || target.terkunci) return undefined;

		// Satu stempel dipakai keduanya. Kalau `dihitungPada` diambil dari `new Date()`
		// yang berbeda, ia bisa berselisih beberapa milidetik dari `terakhirDisimpan`
		// dan penanda "isi sudah berubah sejak dinilai" menyala palsu sejak awal.
		const sekarang = new Date().toISOString();

		const updated: ChapterEntity = {
			...target,
			kontenKerja: input.kontenKerja,
			buktiDukung: input.buktiDukung,
			ragas: { ...input.ragas, dihitungPada: sekarang },
			// Generate menulis isi yang sama sekali baru, jadi tidak ada lagi
			// checkpoint yang jadi basisnya. Tanpa pembersihan ini, checkpoint yang
			// terakhir dipulihkan akan terus mengaku sebagai basis isi bab padahal
			// tulisannya sudah diganti seluruhnya.
			checkpointAktifId: null,
			terakhirDisimpan: sekarang,
		};
		this.save(
			all.map((chapter) => (chapter.id === chapterId ? updated : chapter)),
		);
		this.notify();
		return updated;
	},

	/**
	 * Memulihkan bab ke salah satu checkpoint (docs/application_flow.md §8.1).
	 *
	 * Bentuknya sengaja sama persis dengan {@link applyGenerate} — keduanya
	 * menimpa kondisi aktif dari luar editor, jadi keduanya menolak bab terkunci
	 * (§12.2) dan keduanya menyiarkan.
	 *
	 * `buktiDukung` **ikut dipulihkan**, dan ini melampaui docs: pasal
	 * "Restore ke checkpoint lama" di docs/database.md hanya menyebut
	 * `konten_kerja` + `checkpoint_aktif_id`. Alasannya, kalau bukti dukungnya
	 * ditinggal apa adanya, `BUKTI_DUKUNG_BAB` akan menyatakan konten aktif
	 * disusun dari berkas yang sudah tidak ada hubungannya dengan tulisan yang
	 * barusan dipulihkan — tab Rujukan (§11.1) akan salah sejak hari pertama ia
	 * dibangun. Arsip checkpointnya sendiri tidak tersentuh: yang dibaca di sini
	 * salinan, bukan sumbernya.
	 */
	restoreFromDraft(
		chapterId: string,
		draft: {
			id: string;
			kontenSnapshot: string;
			buktiDukung: BuktiDukungRef[];
			ragas: RagasScore | null;
		},
	): ChapterEntity | undefined {
		const all = this.findAll();
		const target = all.find((chapter) => chapter.id === chapterId);
		if (!target || target.terkunci) return undefined;

		const updated: ChapterEntity = {
			...target,
			kontenKerja: draft.kontenSnapshot,
			buktiDukung: draft.buktiDukung,
			// Ikut dipulihkan dengan alasan yang sama seperti bukti dukungnya: isi
			// aktif kini isi checkpoint itu, jadi penilaian mutunya memang miliknya.
			ragas: draft.ragas,
			checkpointAktifId: draft.id,
			terakhirDisimpan: new Date().toISOString(),
		};
		this.save(
			all.map((chapter) => (chapter.id === chapterId ? updated : chapter)),
		);
		this.notify();
		return updated;
	},

	/**
	 * Kunci review Penjamin Mutu (§12.2).
	 *
	 * **Sengaja tidak memeriksa `terkunci`**, berbeda dari `updateKonten`,
	 * `applyGenerate`, dan `restoreFromDraft` di atas. Yang diblokir §12.2 adalah
	 * perubahan isi bab, bukan perubahan kuncinya sendiri — kalau metode ini ikut
	 * menolak, bab yang sudah terkunci tidak akan pernah bisa dibuka lagi.
	 *
	 * Haknya juga tidak diperiksa di sini melainkan di `useChapterPermission`,
	 * mengikuti pola `canEdit` yang menjaga autosave: repository ini tidak tahu
	 * apa-apa soal session.
	 */
	setTerkunci(chapterId: string, terkunci: boolean): ChapterEntity | undefined {
		const all = this.findAll();
		const target = all.find((chapter) => chapter.id === chapterId);
		if (!target) return undefined;

		const updated: ChapterEntity = {
			...target,
			terkunci,
			// Mengunci berarti reviewnya dimulai, jadi antreannya selesai. Saat
			// membuka kunci nilainya sudah `null` sejak dikunci, jadi baris ini aman
			// untuk kedua arah.
			diajukanReviewPada: terkunci ? null : target.diajukanReviewPada,
		};
		this.save(
			all.map((chapter) => (chapter.id === chapterId ? updated : chapter)),
		);
		// Wajib disiarkan, tidak seperti `updateKonten` yang sengaja diam: kunci
		// menggerakkan tiga kartu KPI "Kesiapan Review" sekaligus badge tabel bab.
		this.notify();
		return updated;
	},

	/**
	 * Catatan review Penjamin Mutu (§12.2), terpisah dari kuncinya.
	 *
	 * Dipisah karena keduanya punya ritme yang berbeda: bab dikunci sekali,
	 * sedangkan catatannya bisa ditulis dan direvisi berkali-kali — termasuk
	 * sebelum kuncinya dipasang sama sekali.
	 *
	 * Sama seperti `setTerkunci`, **tidak memeriksa `terkunci`**: justru bab yang
	 * sedang terkunci itulah yang sedang direview dan paling butuh catatan.
	 */
	setCatatanPenjaminMutu(
		chapterId: string,
		catatan: string | null,
		oleh: { namaLengkap: string },
	): ChapterEntity | undefined {
		const all = this.findAll();
		const target = all.find((chapter) => chapter.id === chapterId);
		if (!target) return undefined;

		// Catatan kosong berarti dicabut, bukan disimpan sebagai string kosong:
		// `pickChaptersNeedingAttention` menandai bab bercatatan lewat kebenaran
		// nilainya, jadi "" akan membuat bab itu menetap di Perlu Perhatian tanpa
		// alasan yang bisa dibaca siapa pun.
		const isi = catatan?.trim() ? catatan.trim() : null;

		const updated: ChapterEntity = {
			...target,
			catatanPenjaminMutu: isi,
			// Penulis dan waktunya ikut dicabut bersama catatannya — atribusi tanpa
			// catatan tidak menerangkan apa pun.
			catatanOlehNama: isi ? oleh.namaLengkap : null,
			catatanPada: isi ? new Date().toISOString() : null,
			// Memberi catatan berarti umpan balik sudah turun dan bolanya kembali ke
			// Penyusun, jadi antreannya selesai. **Mencabut** catatan tidak: itu
			// bukan umpan balik, dan bab yang sedang mengantre harus tetap mengantre.
			diajukanReviewPada: isi ? null : target.diajukanReviewPada,
		};

		this.save(
			all.map((chapter) => (chapter.id === chapterId ? updated : chapter)),
		);
		// Catatan menggerakkan panel Perlu Perhatian di tiga dashboard.
		this.notify();
		return updated;
	},

	/**
	 * Pengajuan review oleh Penyusun.
	 *
	 * Kembarannya `setTerkunci`, dengan mekanisme sama dan pemegang kunci berbeda:
	 * pengajuan membekukan seluruh **Penyusun** (termasuk yang mengajukan) dan
	 * hanya Penyusun yang bisa mencabutnya, sedangkan `terkunci` membekukan semua
	 * orang dan hanya Penjamin Mutu yang bisa membukanya.
	 *
	 * Pembersihannya tidak ada di sini melainkan di dua metode di atas: antrean
	 * hangus begitu Penjamin Mutu merespons.
	 */
	setDiajukanReview(
		chapterId: string,
		diajukan: boolean,
	): ChapterEntity | undefined {
		const all = this.findAll();
		const target = all.find((chapter) => chapter.id === chapterId);
		if (!target) return undefined;

		const updated: ChapterEntity = {
			...target,
			diajukanReviewPada: diajukan ? new Date().toISOString() : null,
		};

		this.save(
			all.map((chapter) => (chapter.id === chapterId ? updated : chapter)),
		);
		// Pengajuan menggerakkan badge tabel Progres per Bab dan hint kartu
		// "Kesiapan Review" di tiga dashboard.
		this.notify();
		return updated;
	},

	/** Dipanggil saat Dokumen LED dihapus supaya babnya tidak jadi sampah. */
	deleteByProjectId(ledProjectId: string): void {
		const all = this.findAll();
		const dibuang = all.filter(
			(chapter) => chapter.ledProjectId === ledProjectId,
		);

		// Checkpoint dan hasil skor menempel ke bab, bukan ke dokumen, jadi keduanya
		// tidak ikut terbawa oleh penyaringan di bawah dan harus dibersihkan
		// sendiri.
		const babIds = dibuang.map((chapter) => chapter.id);
		const draftIds = babIds.flatMap((babId) =>
			chapterDraftRepository.findByChapterId(babId).map((draft) => draft.id),
		);

		chapterScoreRepository.deleteByTargets(babIds, draftIds);
		chapterDraftRepository.deleteByChapterIds(babIds);

		this.save(all.filter((chapter) => chapter.ledProjectId !== ledProjectId));
	},
};
