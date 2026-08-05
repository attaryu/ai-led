import { z } from 'zod';

/**
 * Satu bab dalam Dokumen LED (docs/database.md → BAB_DOKUMEN).
 *
 * Ini adalah **kondisi aktif** bab: `kontenKerja` terus ditimpa autosave, dan
 * checkpoint permanen (`BAB_DRAFT`) baru menyusul di iterasi berikutnya —
 * `checkpointAktifId` sudah disediakan supaya bentuk barisnya tidak berubah lagi
 * saat fitur itu masuk.
 */
export const chapterSchema = z.object({
	id: z.string(),
	ledProjectId: z.string(),
	/**
	 * Urutan tampil sekaligus kunci pencocokan ke rubrik/panduan. Sengaja satu
	 * level: penjenjangan Daftar Isi masih Pertanyaan Terbuka #2 di
	 * docs/application_flow.md §16.
	 */
	urutanBab: z.number().int().positive(),
	judulBab: z.string().min(1),
	/**
	 * Konten editor terserialisasi. `null` berarti bab belum pernah disentuh —
	 * dibedakan dari string kosong yang bisa muncul karena user menghapus semua
	 * tulisannya. Keduanya sama-sama dihitung "belum diisi" oleh
	 * {@link deriveChapterProgress}.
	 */
	kontenKerja: z.string().nullable(),
	/** Menunjuk `BAB_DRAFT` yang jadi basis `kontenKerja`; belum dipakai. */
	checkpointAktifId: z.string().nullable(),
	/** Kunci review Penjamin Mutu (docs/application_flow.md §12.2). */
	terkunci: z.boolean(),
	catatanPenjaminMutu: z.string().nullable(),
	/** ISO; `null` bila belum pernah ada autosave. */
	terakhirDisimpan: z.string().nullable(),
	/**
	 * Denormalisasi `BUKTI_DUKUNG_BAB` (kondisi aktif, ditimpa tiap generate
	 * ulang). Disimpan sebagai daftar id di baris babnya karena sumber datanya
	 * masih localStorage — saat pindah ke API ini kembali jadi tabel relasi.
	 */
	buktiDukungIds: z.array(z.string()),
});

export type ChapterEntity = z.infer<typeof chapterSchema>;

/**
 * Status bab **tidak disimpan** sebagai kolom, melainkan diturunkan dari tiga
 * fakta yang sudah ada (`kontenKerja`, `terkunci`). Alasannya: status hanya
 * kebutuhan tampilan dashboard, dan kolom tersendiri akan jadi state kedua yang
 * bisa tidak sinkron dengan `terkunci` (docs/application_flow.md §6.1a).
 */
export const chapterProgressEnum = z.enum([
	'BELUM_DIISI',
	'SEDANG_DISUSUN',
	'TERKUNCI',
]);
export type ChapterProgress = z.infer<typeof chapterProgressEnum>;

export function hasKonten(chapter: ChapterEntity): boolean {
	return chapter.kontenKerja !== null && chapter.kontenKerja.trim() !== '';
}

/**
 * `terkunci` menang atas kondisi konten: saat bab dikunci, §12.2 memblokir semua
 * aksi ubah data apa pun isi kontennya, jadi itulah fakta paling relevan bagi
 * pembaca dashboard.
 */
export function deriveChapterProgress(chapter: ChapterEntity): ChapterProgress {
	if (chapter.terkunci) return 'TERKUNCI';
	return hasKonten(chapter) ? 'SEDANG_DISUSUN' : 'BELUM_DIISI';
}

export type ChapterSummary = {
	total: number;
	terisi: number;
	belumDiisi: number;
	terkunci: number;
	/** 0–100, dibulatkan. 0 bila dokumen belum punya bab sama sekali. */
	persenKelengkapan: number;
	/** Jumlah bukti dukung **unik** yang dirujuk seluruh bab. */
	buktiDukungTerpakai: number;
	/** ISO simpan terakhir lintas bab; `null` bila belum ada satu pun. */
	terakhirDisimpan: string | null;
	/** Judul bab pemilik `terakhirDisimpan`. */
	babTerakhirDisentuh: string | null;
};

/**
 * Satu kali lintasan untuk seluruh angka di baris KPI. Ditaruh di domain (bukan
 * di komponen) supaya dashboard agregat prodi/institusi nanti bisa memakainya
 * ulang tanpa menyalin aturan hitungnya.
 */
export function summarizeChapters(chapters: ChapterEntity[]): ChapterSummary {
	const buktiDukungUnik = new Set<string>();
	let terisi = 0;
	let terkunci = 0;
	let terakhirDisimpan: string | null = null;
	let babTerakhirDisentuh: string | null = null;

	for (const chapter of chapters) {
		if (hasKonten(chapter)) terisi += 1;
		if (chapter.terkunci) terkunci += 1;
		for (const id of chapter.buktiDukungIds) buktiDukungUnik.add(id);

		if (
			chapter.terakhirDisimpan !== null &&
			(terakhirDisimpan === null ||
				chapter.terakhirDisimpan > terakhirDisimpan)
		) {
			terakhirDisimpan = chapter.terakhirDisimpan;
			babTerakhirDisentuh = chapter.judulBab;
		}
	}

	const total = chapters.length;

	return {
		total,
		terisi,
		belumDiisi: total - terisi,
		terkunci,
		persenKelengkapan: total === 0 ? 0 : Math.round((terisi / total) * 100),
		buktiDukungTerpakai: buktiDukungUnik.size,
		terakhirDisimpan,
		babTerakhirDisentuh,
	};
}

/** Ambang "terbengkalai" untuk bab yang sedang disusun tapi lama tak disentuh. */
export const CHAPTER_STALE_DAYS = 14;

export type ChapterAttention = {
	chapter: ChapterEntity;
	alasan: string;
};

/**
 * Bab yang layak ditonjolkan di panel samping, diurutkan dari yang paling perlu
 * ditindak. Satu bab hanya muncul sekali dengan alasan paling mendesak — daftar
 * ini gunanya menunjukkan langkah berikutnya, bukan mengulang isi tabel.
 *
 * Bab terbengkalai sengaja di atas bab kosong: dokumen yang baru berjalan wajar
 * punya banyak bab kosong, jadi menaruhnya lebih dulu hanya akan mengubur satu
 * pekerjaan yang benar-benar tersendat di bawah tumpukan yang normal.
 */
export function pickChaptersNeedingAttention(
	chapters: ChapterEntity[],
	now: number = Date.now(),
): ChapterAttention[] {
	const staleBefore = now - CHAPTER_STALE_DAYS * 24 * 60 * 60 * 1000;

	const berCatatan: ChapterAttention[] = [];
	const kosong: ChapterAttention[] = [];
	const terbengkalai: ChapterAttention[] = [];

	for (const chapter of chapters) {
		if (chapter.catatanPenjaminMutu) {
			berCatatan.push({
				chapter,
				alasan: 'Ada catatan Penjamin Mutu',
			});
			continue;
		}

		if (!hasKonten(chapter)) {
			kosong.push({ chapter, alasan: 'Belum diisi' });
			continue;
		}

		if (
			!chapter.terkunci &&
			chapter.terakhirDisimpan !== null &&
			new Date(chapter.terakhirDisimpan).getTime() < staleBefore
		) {
			terbengkalai.push({
				chapter,
				alasan: `Tidak tersentuh lebih dari ${CHAPTER_STALE_DAYS} hari`,
			});
		}
	}

	return [...berCatatan, ...terbengkalai, ...kosong];
}
