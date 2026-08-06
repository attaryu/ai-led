import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { chapterLocalSource } from '../sources/local/chapter-local.source';
import { chapterDraftRepository } from './chapter-draft.repository';

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
		terakhirDisimpan: null,
		buktiDukungIds: [],
	}));
}

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
		catatan?: Record<number, string>;
		terbengkalai?: number[];
		buktiDukung?: Record<number, string[]>;
	}
> = {
	'1': {
		babTerisi: 5,
		babTerkunci: 0,
		catatan: {
			3: 'Profil UPPS masih memakai data tahun lalu, mohon diperbarui.',
		},
		terbengkalai: [2],
		buktiDukung: {
			1: ['ev-01', 'ev-02'],
			2: ['ev-02'],
			4: ['ev-01', 'ev-12'],
			5: ['ev-13', 'ev-14'],
		},
	},
	'2': {
		babTerisi: 12,
		babTerkunci: 4,
		buktiDukung: {
			1: ['ev-01'],
			3: ['ev-16'],
			4: ['ev-01', 'ev-02'],
			6: ['ev-17'],
			9: ['ev-04'],
			12: ['ev-16', 'ev-17'],
		},
	},
	'3': {
		babTerisi: CHAPTER_TEMPLATE.length,
		babTerkunci: CHAPTER_TEMPLATE.length,
		buktiDukung: {
			1: ['ev-01', 'ev-02'],
			5: ['ev-18'],
			10: ['ev-18', 'ev-04'],
		},
	},
	// Siklus lama Teknik Informatika, sudah tuntas — isi arsip di Dashboard Prodi.
	'4': {
		babTerisi: CHAPTER_TEMPLATE.length,
		babTerkunci: CHAPTER_TEMPLATE.length,
		buktiDukung: {
			1: ['ev-01'],
			3: ['ev-13'],
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

		return {
			...chapter,
			kontenKerja: terisi ? contohKonten(chapter.judulBab) : null,
			terkunci: chapter.urutanBab <= state.babTerkunci,
			catatanPenjaminMutu: state.catatan?.[chapter.urutanBab] ?? null,
			terakhirDisimpan: terisi
				? terbengkalai
					? daysAgo(31)
					: daysAgo(chapter.urutanBab * 0.35)
				: null,
			buktiDukungIds: state.buktiDukung?.[chapter.urutanBab] ?? [],
		};
	});
}

const initialChapters: ChapterEntity[] = Object.keys(SEED_STATE).flatMap(
	buildSeededChapters,
);

export const chapterRepository = {
	findAll(): ChapterEntity[] {
		const stored = chapterLocalSource.getAll();
		if (!stored) {
			this.save(initialChapters);
			return initialChapters;
		}
		try {
			return JSON.parse(stored);
		} catch {
			this.save(initialChapters);
			return initialChapters;
		}
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
		input: { kontenKerja: string; buktiDukungIds: string[] },
	): ChapterEntity | undefined {
		const all = this.findAll();
		const target = all.find((chapter) => chapter.id === chapterId);
		if (!target || target.terkunci) return undefined;

		const updated: ChapterEntity = {
			...target,
			kontenKerja: input.kontenKerja,
			buktiDukungIds: input.buktiDukungIds,
			// Generate menulis isi yang sama sekali baru, jadi tidak ada lagi
			// checkpoint yang jadi basisnya. Tanpa pembersihan ini, checkpoint yang
			// terakhir dipulihkan akan terus mengaku sebagai basis isi bab padahal
			// tulisannya sudah diganti seluruhnya.
			checkpointAktifId: null,
			terakhirDisimpan: new Date().toISOString(),
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
	 * `buktiDukungIds` **ikut dipulihkan**, dan ini melampaui docs: pasal
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
		draft: { id: string; kontenSnapshot: string; buktiDukungIds: string[] },
	): ChapterEntity | undefined {
		const all = this.findAll();
		const target = all.find((chapter) => chapter.id === chapterId);
		if (!target || target.terkunci) return undefined;

		const updated: ChapterEntity = {
			...target,
			kontenKerja: draft.kontenSnapshot,
			buktiDukungIds: draft.buktiDukungIds,
			checkpointAktifId: draft.id,
			terakhirDisimpan: new Date().toISOString(),
		};
		this.save(
			all.map((chapter) => (chapter.id === chapterId ? updated : chapter)),
		);
		this.notify();
		return updated;
	},

	/** Dipanggil saat Dokumen LED dihapus supaya babnya tidak jadi sampah. */
	deleteByProjectId(ledProjectId: string): void {
		const all = this.findAll();
		const dibuang = all.filter(
			(chapter) => chapter.ledProjectId === ledProjectId,
		);

		// Checkpoint menempel ke bab, bukan ke dokumen, jadi ia tidak ikut terbawa
		// oleh penyaringan di bawah dan harus dibersihkan sendiri.
		chapterDraftRepository.deleteByChapterIds(
			dibuang.map((chapter) => chapter.id),
		);

		this.save(all.filter((chapter) => chapter.ledProjectId !== ledProjectId));
	},
};
