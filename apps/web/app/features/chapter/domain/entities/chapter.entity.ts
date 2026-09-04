import { z } from 'zod';

import { buktiDukungRefSchema } from './bukti-dukung-ref.entity';
import { chapterScoreSchema } from './chapter-score.entity';
import { ragasScoreSchema } from './ragas-score.entity';

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
	 * docs/application_flow.md §16. Daftar Isi berjenjang yang dipakai Editor Bab
	 * memetakan dirinya ke kolom ini — lihat `chapter-toc.entity.ts`.
	 */
	urutanBab: z.number().int().positive(),
	judulBab: z.string().min(1),
	/**
	 * Konten editor terserialisasi. `null` berarti bab belum pernah disentuh —
	 * dibedakan dari string kosong yang bisa muncul karena user menghapus semua
	 * tulisannya. Keduanya sama-sama dihitung "belum diisi" oleh
	 * {@link deriveChapterProgress}.
	 *
	 * **Formatnya string HTML**, bukan JSON ProseMirror. docs/database.md menyebut
	 * kolomnya `jsonb`; keduanya tidak bertabrakan karena kolom JSON nanti tinggal
	 * memuat `{ format: 'html', body: '<p>…</p>' }`. Alasan memilih HTML: data
	 * contoh (dan bab mana pun yang lahir sebelum editor ada) berisi kalimat biasa
	 * — `content` HTML melewatkannya ke DOMParser yang membungkusnya jadi paragraf
	 * tanpa satu baris kode migrasi, sedangkan `JSON.parse` akan melempar dan
	 * memaksa cabang penyelamat permanen di tiap tempat baca.
	 */
	kontenKerja: z.string().nullable(),
	/** Menunjuk `BAB_DRAFT` yang jadi basis `kontenKerja`; belum dipakai. */
	checkpointAktifId: z.string().nullable(),
	/** Kunci review Penjamin Mutu (docs/application_flow.md §12.2). */
	terkunci: z.boolean(),
	catatanPenjaminMutu: z.string().nullable(),
	/**
	 * Penulis dan waktu catatan terakhir. Namanya ikut disimpan — bukan hanya
	 * `userId` — dengan alasan yang sama seperti `BAB_DRAFT.dibuatOlehNama`:
	 * catatan harus tetap terbaca setelah usernya dihapus.
	 *
	 * Keduanya selalu bergerak bersama `catatanPenjaminMutu`, termasuk saat
	 * catatannya dikosongkan. `.default(null)` seperti `ragas` di bawah supaya
	 * baris yang tersimpan sebelum kedua kolom ini ada tetap lolos `findAll`.
	 */
	catatanOlehNama: z.string().nullable().default(null),
	catatanPada: z.string().nullable().default(null),
	/**
	 * Kapan Penyusun menyatakan bab ini siap direview; `null` berarti tidak sedang
	 * diantrekan.
	 *
	 * Tanpa kolom pengaju: pengajuan membekukan **peran** Penyusun — termasuk yang
	 * mengajukan — bukan satu user tertentu, jadi tidak ada `userId` yang perlu
	 * dibandingkan. Pengaju tetap memegang kuncinya lewat "Batalkan Pengajuan".
	 */
	diajukanReviewPada: z.string().nullable().default(null),
	/** ISO; `null` bila belum pernah ada autosave. */
	terakhirDisimpan: z.string().nullable(),
	/**
	 * Denormalisasi `BUKTI_DUKUNG_BAB` (kondisi aktif, ditimpa tiap generate
	 * ulang). Disimpan di baris babnya karena sumber datanya masih localStorage —
	 * saat pindah ke API ini kembali jadi tabel relasi.
	 *
	 * Bentuknya {@link BuktiDukungRef}, bukan sekadar daftar id: alasan lengkapnya
	 * ada di entitas itu — singkatnya, berkas yang dihapus dari Perpustakaan harus
	 * tetap bisa disebutkan namanya di tab Bukti.
	 */
	buktiDukung: z.array(buktiDukungRefSchema),
	/**
	 * Mutu jawaban AI untuk isi bab ini (docs/application_flow.md §10), ditimpa
	 * tiap generate. `null` berarti isinya tidak lahir dari generate — bab yang
	 * ditulis tangan memang tidak punya skor RAGAS, dan itu keadaan yang sah.
	 *
	 * `.default(null)`, bukan sekadar `.nullable()`: dengan begitu baris lama yang
	 * tersimpan sebelum kolom ini ada tetap lolos validasi `findAll` dan cuma
	 * terisi `null`, alih-alih dianggap rusak lalu menghapus pekerjaan lokal
	 * penggunanya.
	 */
	ragas: ragasScoreSchema.nullable().default(null),
	/**
	 * Hasil simulasi rubrik untuk kondisi aktif bab ini (`targetTipe = 'BAB_AKTIF'`,
	 * tab Rubrik). Sama alasannya dengan `ragas`: ditimpa tiap simulasi ulang, dan
	 * `.default([])` supaya baris lama tanpa kolom ini tetap lolos `findAll`.
	 */
	hasilSkorKriteriaAktif: z.array(chapterScoreSchema).default([]),
});

export type ChapterEntity = z.infer<typeof chapterSchema>;

/**
 * Status bab **tidak disimpan** sebagai kolom, melainkan diturunkan dari fakta
 * yang sudah ada (`kontenKerja`, `diajukanReviewPada`, `terkunci`). Alasannya:
 * status hanya kebutuhan tampilan dashboard, dan kolom tersendiri akan jadi
 * state kedua yang bisa tidak sinkron dengan ketiganya
 * (docs/application_flow.md §6.1a).
 */
export const chapterProgressEnum = z.enum([
	'BELUM_DIISI',
	'SEDANG_DISUSUN',
	'MENUNGGU_REVIEW',
	'TERKUNCI',
]);
export type ChapterProgress = z.infer<typeof chapterProgressEnum>;

/**
 * Sebutan tiap status di layar. Ditaruh di domain karena dipakai lebih dari satu
 * bentuk tampilan — badge per bab (§6.1a) dan bar bertumpuk di ringkasan (§5.1b)
 * — dan dua daftar kata sendiri-sendiri pasti akan berbeda suatu saat.
 */
export const chapterProgressLabels: Record<ChapterProgress, string> = {
	BELUM_DIISI: 'Belum diisi',
	SEDANG_DISUSUN: 'Sedang disusun',
	MENUNGGU_REVIEW: 'Menunggu review',
	TERKUNCI: 'Terkunci',
};

/**
 * Urutan baca ringkasan: dari yang paling tuntas ke yang belum tersentuh.
 * Dipakai bar bertumpuk beserta legendanya supaya kemajuan terbaca bertambah
 * dari kiri, bukan melompat-lompat mengikuti urutan enum.
 */
export const chapterProgressOrder: ChapterProgress[] = [
	'TERKUNCI',
	'MENUNGGU_REVIEW',
	'SEDANG_DISUSUN',
	'BELUM_DIISI',
];

/**
 * Bungkus paragraf kosong yang tetap ditinggalkan editor sesudah seluruh
 * tulisannya dihapus (`<p></p>`, kadang berisi `<br>` atau `&nbsp;`).
 */
const HTML_KOSONG = /^(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/i;

/**
 * Bab dianggap terisi bila `kontenKerja` punya tulisan sungguhan.
 *
 * Cek `trim()` saja tidak cukup sejak isinya jadi HTML: bab yang dikosongkan
 * user menyisakan `<p></p>` yang lolos begitu saja, sehingga bab itu akan terus
 * terhitung "terisi" di seluruh KPI dashboard prodi dan institusi. Editor sudah
 * menulis string kosong untuk kasus itu ({@link ChapterEntity.kontenKerja}),
 * tapi penjagaannya diulang di sini karena aksi Generate nanti juga menulis HTML
 * dan tidak boleh ikut mewarisi jebakannya.
 */
export function hasKonten(chapter: ChapterEntity): boolean {
	if (chapter.kontenKerja === null) return false;
	const isi = chapter.kontenKerja.trim();
	return isi !== '' && !HTML_KOSONG.test(isi);
}

/**
 * Urutannya dari yang paling membatasi. `terkunci` menang atas segalanya: saat
 * bab dikunci, §12.2 memblokir semua aksi ubah data apa pun isi kontennya, jadi
 * itulah fakta paling relevan bagi pembaca dashboard. Pengajuan menyusul di
 * bawahnya — ia hanya membekukan Penyusun, Penjamin Mutu masih bisa menyunting.
 */
export function deriveChapterProgress(chapter: ChapterEntity): ChapterProgress {
	if (chapter.terkunci) return 'TERKUNCI';
	if (chapter.diajukanReviewPada) return 'MENUNGGU_REVIEW';
	return hasKonten(chapter) ? 'SEDANG_DISUSUN' : 'BELUM_DIISI';
}

export type ChapterSummary = {
	total: number;
	terisi: number;
	belumDiisi: number;
	terkunci: number;
	/** Bab yang diajukan Penyusun dan belum direspons Penjamin Mutu. */
	menungguReview: number;
	/**
	 * Jumlah bab per status turunan {@link deriveChapterProgress}. Berbeda dari
	 * `terisi`/`terkunci`/`menungguReview` di atas yang masing-masing menjawab satu
	 * pertanyaan sendiri dan **boleh tumpang tindih** (bab terkunci yang kontennya
	 * kosong terhitung di dua tempat), keempat angka di sini saling lepas dan
	 * totalnya persis `total`.
	 *
	 * Itulah syarat sebuah bar bertumpuk bisa dibaca sebagai pembagian satu
	 * dokumen. Sumber aturannya sengaja `deriveChapterProgress` — sama dengan
	 * `ChapterStatusBadge`, supaya bar dan badge tidak pernah berbeda pendapat.
	 */
	perStatus: Record<ChapterProgress, number>;
	/** 0–100, dibulatkan. 0 bila dokumen belum punya bab sama sekali. */
	persenKelengkapan: number;
	/** 0–100, dibulatkan. Penyebutnya `total`, sama dengan `persenKelengkapan`. */
	persenKesiapanReview: number;
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
	let menungguReview = 0;
	let terakhirDisimpan: string | null = null;
	let babTerakhirDisentuh: string | null = null;
	const perStatus: Record<ChapterProgress, number> = {
		BELUM_DIISI: 0,
		SEDANG_DISUSUN: 0,
		MENUNGGU_REVIEW: 0,
		TERKUNCI: 0,
	};

	for (const chapter of chapters) {
		if (hasKonten(chapter)) terisi += 1;
		if (chapter.terkunci) terkunci += 1;
		// Sejalan dengan `deriveChapterProgress`: bab yang sudah dikunci tidak lagi
		// terhitung mengantre, karena reviewnya memang sudah berjalan.
		if (!chapter.terkunci && chapter.diajukanReviewPada) menungguReview += 1;
		perStatus[deriveChapterProgress(chapter)] += 1;
		for (const ref of chapter.buktiDukung) buktiDukungUnik.add(ref.id);

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
		menungguReview,
		perStatus,
		persenKelengkapan: total === 0 ? 0 : Math.round((terisi / total) * 100),
		persenKesiapanReview: total === 0 ? 0 : Math.round((terkunci / total) * 100),
		buktiDukungTerpakai: buktiDukungUnik.size,
		terakhirDisimpan,
		babTerakhirDisentuh,
	};
}

/**
 * Bab yang paling baru disimpan, terbaru di atas. Bab yang belum pernah
 * disentuh tidak ikut — daftar ini gunanya menunjukkan di mana pekerjaan
 * terakhir terjadi, bukan mendaftar ulang isi dokumen.
 *
 * Di domain, bukan di komponen, dengan alasan yang sama seperti
 * {@link summarizeChapters}: jejak aktivitas yang sama dipakai Dashboard Prodi
 * dan akan dipakai dashboard institusi nanti.
 */
export function pickRecentChapterSaves(
	chapters: ChapterEntity[],
	limit: number,
): ChapterEntity[] {
	return chapters
		.filter((chapter) => chapter.terakhirDisimpan !== null)
		.sort((a, b) => b.terakhirDisimpan!.localeCompare(a.terakhirDisimpan!))
		.slice(0, limit);
}

/**
 * Bab yang dibuka saat Editor Bab dimasuki tanpa menyebut babnya
 * (docs/application_flow.md §7.1).
 *
 * Bab yang paling baru disimpan menang: masuk lewat menu sidebar selalu berarti
 * "lanjutkan", bukan "mulai dari awal". Dokumen yang belum pernah disentuh jatuh
 * ke bab pertama. Diletakkan di domain, bukan di komponen pengalih, supaya
 * tautan di sidebar Dashboard Project LED memakai aturan yang persis sama —
 * dua tempat dengan aturan sendiri-sendiri pasti akan berbeda pendapat.
 */
export function pickDefaultChapter(
	chapters: ChapterEntity[],
): ChapterEntity | undefined {
	return (
		pickRecentChapterSaves(chapters, 1)[0] ??
		[...chapters].sort((a, b) => a.urutanBab - b.urutanBab)[0]
	);
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
 *
 * **Bab yang diajukan untuk review sengaja tidak masuk sini** — jangan
 * "melengkapinya" nanti. Dua sebabnya:
 *
 * 1. `institution-readiness.entity.ts` menghitung isi panel ini jadi
 *    `perluDitindak`, dan `compareProgramRisk` memakainya untuk mengurutkan
 *    tabel risiko Dashboard Utama. Bab terajukan akan mendorong prodinya naik ke
 *    puncak daftar risiko — memperlakukan kemajuan sebagai masalah.
 * 2. Panel ini merender tiap baris dengan ikon peringatan tanpa konsep severity,
 *    jadi kabar baik akan tampil sebagai gangguan.
 *
 * Antrean review punya rumahnya sendiri: badge `MENUNGGU_REVIEW` di tabel
 * Progres per Bab, plus hint kartu "Kesiapan Review".
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
