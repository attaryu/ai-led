import { z } from 'zod';

import { type ChapterEntity } from './chapter.entity';

/**
 * Daftar Isi Editor Bab (docs/application_flow.md §7.1).
 *
 * **Sekarang 1:1 dengan `CHAPTER_TEMPLATE`.** Sebelum matriks penilaian asli
 * diunggah, `CHAPTER_TEMPLATE` punya 14 bab (satu per "Kriteria N") dan pohon
 * ini terpaksa menebak-nebak pemetaannya. Sesudah struktur LED asli
 * diverifikasi dari `led_bab_tabel.json`, `CHAPTER_TEMPLATE` diperkecil jadi 4
 * bab yang cocok persis dokumen aslinya — dan seluruh kriteria akreditasi
 * (C.1–C.7) ternyata anak BAB II, bukan bab tersendiri. Itu menjawab
 * Pertanyaan Terbuka #2 (§16) dengan sendirinya: **satu `BAB_DOKUMEN` = satu
 * `konten_kerja`, C.1–C.7 di bawahnya murni visual** (§7.2) — bukan lagi
 * tebakan, karena sekarang cuma ada 4 `BAB_DOKUMEN` sungguhan.
 *
 * **Hanya simpul ber-`urutanBab` yang navigasional** (empat simpul BAB
 * teratas). Cabang di bawahnya (`A`/`B`/`C.1`…`C.7`) `urutanBab`-nya `null`:
 * kliknya tidak boleh keluar dari bab yang sedang dibuka.
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
 * Cabang dalam milik C.1, cocok dengan tiga indikator asli (matrix.json no.
 * 1–3 — lihat `guidance-point.entity.ts`). Seluruhnya visual: semuanya bagian
 * dari satu `konten_kerja` BAB II (§7.2).
 */
const RINCIAN_C1: ChapterTocNode[] = [
	simpul('c1-1-1', '1.1 Latar Belakang', null),
	simpul('c1-1-2', '1.2 Kebijakan', null),
	simpul('c1-1-3', '1.3 Indikator Kinerja Utama (IKU)', null, [
		simpul('c1-1-3-a', 'a) Kekhasan VMTS', null),
		simpul('c1-1-3-b', 'b) Mekanisme penyusunan VMTS', null),
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
 * Tujuh kelompok kriteria akreditasi C.1–C.7, judulnya sama persis dengan
 * `KELOMPOK_KRITERIA` di `guidance-point.entity.ts` (satu penurunan yang sama
 * dari `led_bab_tabel.json`, sengaja tidak disalin dua kali sebagai konstanta
 * terpisah — lihat catatan di sana kalau berubah). C.2–C.7 sengaja belum
 * dijabarkan serinci C.1: rincian lima-poinnya identik untuk semua kelompok
 * (lihat `POIN_PEDOMAN`), jadi mengulangnya di sini cuma menyalin nama yang
 * sudah benar di panel Panduan.
 */
const KRITERIA: ChapterTocNode[] = [
	simpul(
		'c-1',
		'C.1. Diferensiasi Misi (Visi, Misi, Tujuan, dan Strategi)',
		null,
		RINCIAN_C1,
	),
	simpul('c-2', 'C.2. Akuntabilitas', null),
	simpul('c-3', 'C.3. Relevansi Pendidikan, Penelitian, dan PkM', null),
	simpul('c-4', 'C.4. Sumber Daya Manusia', null),
	simpul(
		'c-5',
		'C.5. Sarana, Prasarana, dan Keselamatan Kesehatan Kerja dan Lingkungan (K3L)',
		null,
	),
	simpul('c-6', 'C.6. Mahasiswa dan Luaran Mahasiswa', null),
	simpul('c-7', 'C.7. Sistem Penjaminan Mutu', null),
];

export const CHAPTER_TOC: ChapterTocNode[] = [
	simpul('bab-1', 'BAB I. PENDAHULUAN', 1),
	simpul('bab-2', 'BAB II. STRUKTUR LAPORAN EVALUASI DIRI', 2, [
		simpul('bab-2-a', 'A. Struktur Tim Penyusun dan Mekanisme Kerja', null),
		simpul(
			'bab-2-b',
			'B. Analisis Lingkungan Eksternal dalam Pengembangan UPPS dan Prodi',
			null,
			[
				simpul('bab-2-b-1', 'B.1 Lingkungan Makro', null),
				simpul('bab-2-b-2', 'B.2 Lingkungan Mikro', null),
			],
		),
		simpul('bab-2-c', 'C. Kriteria Akreditasi', null, KRITERIA),
	]),
	simpul('bab-3', 'BAB III. PROGRAM PENGEMBANGAN BERKELANJUTAN', 3),
	simpul('bab-4', 'BAB IV. PENUTUP', 4),
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
