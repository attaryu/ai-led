import { z } from 'zod';

import { type ChapterEntity } from './chapter.entity';

/**
 * Daftar Isi Editor Bab (docs/application_flow.md §7.1) — **MOCK STATIS**.
 *
 * Ini bukan keputusan, ini penahan sementara. Pertanyaan Terbuka #2 (§16) belum
 * terjawab: belum jelas apakah struktur berjenjang ini master data baku
 * (sekelas `RUBRIK_KRITERIA_BAB`), dihasilkan otomatis dari heading yang ditulis
 * user di dalam `konten_kerja` seperti outline Google Docs, atau justru
 * menandakan unit "satu ruang kerja" sebenarnya ada di granularitas sub-bab.
 *
 * Yang dipilih sementara, beserta alasannya:
 *
 * - **Hanya simpul ber-`urutanBab` yang navigasional.** Cabang di bawahnya
 *   visual belaka, karena §7.2 menyatakan satu `BAB_DOKUMEN` = satu
 *   `konten_kerja` utuh yang TIDAK dipecah jadi entitas terpisah per section.
 *   Ini satu-satunya cabang #2 yang konsisten dengan model data yang ada.
 * - **Label di sini menang atas `judulBab` dari data.** Konsekuensinya bab yang
 *   sama bisa bernama beda di sidebar editor dan di tabel Progres Dokumen —
 *   misal `urutanBab` 4 yang di `CHAPTER_TEMPLATE` bernama "Kriteria 1 — Visi,
 *   Misi, Tujuan, dan Strategi" muncul di sini sebagai "C.1. Diferensiasi Misi".
 *   Diterima demi kesetiaan pada rancangan; mendamaikan keduanya bagian dari #2.
 * - **Pohonnya melebihi rancangan dengan sengaja.** Rancangan hanya menjabarkan
 *   cabang C.1. Kalau konstanta ini cuma memuat itu, 11 dari 14 bab jadi tak
 *   terjangkau dari sidebar — melanggar §7.1 dan membuat tautan dari tabel
 *   Progres Dokumen jadi yatim. Jadi cabang dalam C.1 disalin persis, lalu
 *   C.2…C.9 ditambahkan sebagai saudaranya.
 *
 * Kalau #2 jatuh ke cabang sebaliknya (satu daun Daftar Isi = satu ruang kerja),
 * yang berubah cuma konstanta ini: simpul dalam tinggal diberi `urutanBab`
 * sendiri. Tidak ada komponen yang perlu disentuh.
 *
 * Lihat juga catatan `urutanBab` di chapter.entity.ts dan `CHAPTER_TEMPLATE` di
 * data/repositories/chapter.repository.ts — ketiganya menunjuk #2 yang sama.
 */
const tocNodeBase = z.object({
	/** Stabil; dipakai sebagai key React dan — nanti — sebagai id anchor. */
	id: z.string(),
	label: z.string(),
	/**
	 * Non-null → simpul ini setara satu `BAB_DOKUMEN`, kliknya mengganti bab yang
	 * dibuka. `null` → simpul struktural/visual: kliknya tidak boleh keluar dari
	 * bab yang sedang dibuka (§7.2).
	 */
	urutanBab: z.number().int().positive().nullable(),
});

export type ChapterTocNode = z.infer<typeof tocNodeBase> & {
	children: ChapterTocNode[];
};

export const chapterTocNodeSchema: z.ZodType<ChapterTocNode> =
	tocNodeBase.extend({
		get children() {
			return z.array(chapterTocNodeSchema);
		},
	});

function simpul(
	id: string,
	label: string,
	urutanBab: number | null,
	children: ChapterTocNode[] = [],
): ChapterTocNode {
	return { id, label, urutanBab, children };
}

/**
 * Cabang dalam milik C.1, disalin persis dari rancangan. Seluruhnya visual:
 * semuanya bagian dari satu `konten_kerja` bab Kriteria 1 (§7.2).
 */
const RINCIAN_C1: ChapterTocNode[] = [
	simpul('c1-1-1', '1.1 Latar Belakang', null),
	simpul('c1-1-2', '1.2 Kebijakan', null),
	simpul('c1-1-3', '1.3 Indikator Kinerja Utama (IKU)', null, [
		simpul('c1-1-3-a', 'a) Kekhasan VMTS', null),
		simpul('c1-1-3-b', 'b) Mekanisme Penyusunan VMTS', null),
		simpul('c1-1-3-c', 'c) Tingkat pemahaman dan pencapaian VMTS', null),
	]),
	simpul(
		'c1-1-4',
		'1.4. Analisis Faktor Keberhasilan dan Penghambat Pencapaian VMTS',
		null,
	),
	simpul(
		'c1-1-5',
		'1.5. Strategi perbaikan dan pengembangan (Menggunakan Analisis SWOT)',
		null,
	),
];

/**
 * Sembilan kriteria akreditasi LAM Teknik. Yang pertama membawa rincian dari
 * rancangan; sisanya sengaja belum dijabarkan — rinciannya bagian dari #2 yang
 * sama, dan menebak-nebak isinya hanya akan menambah yang harus dibongkar nanti.
 */
const KRITERIA: ChapterTocNode[] = [
	simpul(
		'c-1',
		'C.1. Diferensiasi Misi (Visi, Misi, Tujuan, dan Strategi)',
		4,
		RINCIAN_C1,
	),
	simpul('c-2', 'C.2. Tata Pamong, Tata Kelola, dan Kerja Sama', 5),
	simpul('c-3', 'C.3. Mahasiswa', 6),
	simpul('c-4', 'C.4. Sumber Daya Manusia', 7),
	simpul('c-5', 'C.5. Keuangan, Sarana, dan Prasarana', 8),
	simpul('c-6', 'C.6. Pendidikan', 9),
	simpul('c-7', 'C.7. Penelitian', 10),
	simpul('c-8', 'C.8. Pengabdian kepada Masyarakat', 11),
	simpul('c-9', 'C.9. Luaran dan Capaian Tridharma', 12),
];

export const CHAPTER_TOC: ChapterTocNode[] = [
	simpul('bab-1', 'BAB I. PENDAHULUAN', 1, [
		// provisional: pemetaan ke `urutanBab` 3 ditebak dari kemiripan judul.
		simpul('bab-1-profil', 'Profil Unit Pengelola Program Studi', 3),
	]),
	simpul('bab-2', 'BAB II. STRUKTUR LAPORAN EVALUASI DIRI', null, [
		// provisional: tidak ada bab di CHAPTER_TEMPLATE yang jelas pasangannya.
		simpul('bab-2-a', 'A. Struktur Tim Penyusun dan Mekanisme Kerja', null),
		// provisional: dipetakan ke "Kondisi Eksternal" atas kemiripan judul.
		simpul(
			'bab-2-b',
			'B. Analisis Lingkungan Eksternal dalam Pengembangan UPPS dan Prodi',
			2,
		),
		simpul('bab-2-c', 'C. Kriteria Akreditasi', null, KRITERIA),
		simpul('bab-2-d', 'D. Analisis dan Penetapan Program Pengembangan', 13),
	]),
	simpul('bab-3', 'BAB III. PENUTUP', 14),
];

/**
 * Simpul → bab, lewat pencarian di daftar bab nyata alih-alih menyusun
 * `bab-${projectId}-${urutanBab}` sendiri: format id itu milik repository dan
 * tidak boleh punya salinan kedua di sini.
 */
export function findChapterForTocNode(
	node: ChapterTocNode,
	chapters: ChapterEntity[],
): ChapterEntity | undefined {
	if (node.urutanBab === null) return undefined;
	return chapters.find((chapter) => chapter.urutanBab === node.urutanBab);
}

/**
 * Jalur dari akar ke simpul yang memuat bab tersebut, dipakai sidebar untuk
 * membentangkan cabang yang sedang dibuka. Kosong bila babnya tidak terwakili
 * di pohon — mungkin selama pemetaan #2 masih provisional, jadi bukan kesalahan.
 */
export function findTocPathForChapter(
	urutanBab: number,
	nodes: ChapterTocNode[] = CHAPTER_TOC,
): ChapterTocNode[] {
	for (const node of nodes) {
		if (node.urutanBab === urutanBab) return [node];
		const jalur = findTocPathForChapter(urutanBab, node.children);
		if (jalur.length > 0) return [node, ...jalur];
	}
	return [];
}
