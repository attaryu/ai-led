import { z } from 'zod';

import { accreditationSetRepository } from '~/features/accreditation-set/data/repositories/accreditation-set.repository';
import { type ChapterTemplateEntity } from '~/features/accreditation-set/domain/entities/chapter-template.entity';
import { rubricCriterionAmiRepository } from '~/features/assessment/data/repositories/rubric-criterion-ami.repository';
import { type ChapterEntity } from './chapter.entity';
import { kelompokkanKriteria } from './guidance-point.entity';

/**
 * Daftar Isi Editor Bab (docs/application_flow.md §7.1).
 *
 * **Sekarang 1:1 dengan `CHAPTER_TEMPLATE`.** Sebelum matriks penilaian asli
 * diunggah, `CHAPTER_TEMPLATE` punya 14 bab (satu per "Kriteria N") dan pohon
 * ini terpaksa menebak-nebak pemetaannya. Sesudah struktur LED asli
 * diverifikasi dari `led_bab_tabel.json`, `CHAPTER_TEMPLATE` diperkecil jadi 4
 * bab yang cocok persis dokumen aslinya — dan seluruh kriteria akreditasi
 * ternyata anak BAB II, bukan bab tersendiri. Itu menjawab
 * Pertanyaan Terbuka #2 (§16) dengan sendirinya: **satu `BAB_DOKUMEN` = satu
 * `konten_kerja`, kriteria akreditasi di bawahnya murni visual** (§7.2) — bukan
 * lagi tebakan, karena sekarang cuma ada 4 `BAB_DOKUMEN` sungguhan.
 *
 * **Hanya simpul ber-`urutanBab` yang navigasional** (empat simpul BAB
 * teratas). Cabang di bawahnya `urutanBab`-nya `null`: kliknya tidak boleh
 * keluar dari bab yang sedang dibuka.
 *
 * **Kelompok kriteria akreditasi di bawah BAB II dibangun per Set Akreditasi
 * dokumen ini** (`buildChapterToc`, lewat {@link kelompokkanKriteria} yang
 * sama dipakai panel Panduan) — bukan lagi daftar C.1–C.7 LAM Teknik yang
 * di-hardcode. Rincian IKU per-huruf yang dulu ada di bawah tiap kelompok
 * dihapus: itu placeholder visual yang tidak pernah bisa diklik (butuh anchor
 * heading nyata di dalam `kontenKerja` yang belum ada), jadi menyalinnya jadi
 * data dinamis cuma menambah kerumitan tanpa menambah fungsi.
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
 * Kelompok kriteria akreditasi di bawah BAB II, judulnya diambil dari
 * `kriteria.kriteria` Set Akreditasi dokumen ini — lihat
 * `guidance-point.entity.ts::kelompokkanKriteria` untuk cara pengelompokannya.
 * Nomor urutnya sekuensial (1, 2, 3, …) mengikuti urutan kemunculan, bukan
 * kode "C.N" tetap — set kustom bisa punya jumlah kelompok berapa pun.
 */
function simpulKriteriaUntukBab(
	semuaKriteria: Awaited<ReturnType<typeof rubricCriterionAmiRepository.findAll>>,
	urutanBab: number,
): ChapterTocNode[] {
	const kriteriaBab = semuaKriteria.filter((k) => k.urutanBab.includes(urutanBab));
	return kelompokkanKriteria(kriteriaBab).map((kelompok, indeks) =>
		simpul(`bab-${urutanBab}-kelompok-${indeks + 1}`, `C.${indeks + 1}. ${kelompok.judul}`, null),
	);
}

/**
 * Pohon 4-bab tetap (LAM Teknik) — fallback untuk set yang belum/tidak
 * pernah upload+ekstrak Panduan Penulisan (`ChapterTemplate` kosong).
 * Kelompok kriteria BAB II tetap dari Set Akreditasi dokumen ini.
 */
function buildFallbackToc(
	semuaKriteria: Awaited<ReturnType<typeof rubricCriterionAmiRepository.findAll>>,
): ChapterTocNode[] {
	return [
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
			simpul(
				'bab-2-c',
				'C. Kriteria Akreditasi',
				null,
				simpulKriteriaUntukBab(semuaKriteria, 2),
			),
		]),
		simpul('bab-3', 'BAB III. PROGRAM PENGEMBANGAN BERKELANJUTAN', 3),
		simpul('bab-4', 'BAB IV. PENUTUP', 4),
	];
}

/**
 * Bab dari `ChapterTemplate` set ini (worker.py::_handle_ingestion_struktur_dokumen)
 * — anaknya `SubBabTemplate` (referensi resmi pedoman, dekoratif) plus
 * kelompok kriteria akreditasi yang menyebut bab ini, digeneralisasi dari
 * `buildFallbackToc` yang cuma pernah menempelkannya ke bab nomor 2.
 */
function buildTocFromTemplates(
	templates: ChapterTemplateEntity[],
	semuaKriteria: Awaited<ReturnType<typeof rubricCriterionAmiRepository.findAll>>,
): ChapterTocNode[] {
	return templates.map((bab) => {
		const anakSubBab = bab.subBab.map((sub) =>
			simpul(`bab-${bab.urutan}-sub-${sub.urutan}`, sub.judul, null),
		);
		const anakKriteria = simpulKriteriaUntukBab(semuaKriteria, bab.urutan);
		return simpul(`bab-${bab.urutan}`, bab.judul, bab.urutan, [...anakSubBab, ...anakKriteria]);
	});
}

/**
 * Bangun pohon Daftar Isi lengkap untuk satu dokumen. Mengambil struktur
 * bab dari `ChapterTemplate` set ini kalau sudah pernah diekstrak
 * (`accreditationSetRepository.findChapterTemplates`); kosong (belum
 * pernah upload Panduan Penulisan, atau set lama) → fallback ke pohon
 * 4-bab tetap seperti sebelum fitur ini ada. Kelompok kriteria BAB II
 * tetap dari Set Akreditasi yang benar-benar dipilihnya (`accreditationSetId`,
 * dari `ledProjectRepository`).
 */
export async function buildChapterToc(
	accreditationSetId: string | null | undefined,
): Promise<ChapterTocNode[]> {
	const [semuaKriteria, templates] = await Promise.all([
		rubricCriterionAmiRepository.findAll(accreditationSetId),
		accreditationSetId
			? accreditationSetRepository.findChapterTemplates(accreditationSetId)
			: Promise.resolve([]),
	]);

	return templates.length > 0
		? buildTocFromTemplates(templates, semuaKriteria)
		: buildFallbackToc(semuaKriteria);
}

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
 * di pohon, atau `nodes` belum sempat termuat (`buildChapterToc` masih
 * berjalan) — bukan kesalahan, hanya belum ada apa-apa untuk dibentangkan.
 */
export function findTocPathForChapter(
	urutanBab: number,
	nodes: ChapterTocNode[],
): ChapterTocNode[] {
	for (const node of nodes) {
		if (node.urutanBab === urutanBab) return [node];
		const jalur = findTocPathForChapter(urutanBab, node.children);
		if (jalur.length > 0) return [node, ...jalur];
	}
	return [];
}
