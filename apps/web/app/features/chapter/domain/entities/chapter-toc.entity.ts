import { z } from 'zod';

import { accreditationSetRepository } from '~/features/accreditation-set/data/repositories/accreditation-set.repository';
import { type ChapterTemplateEntity } from '~/features/accreditation-set/domain/entities/chapter-template.entity';
import { rubricCriterionAmiRepository } from '~/features/assessment/data/repositories/rubric-criterion-ami.repository';
import { chapterRepository } from '../../data/repositories/chapter.repository';
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
	 * dibuka (`workingContent` gabungan, tampilan "bab utuh"). `null` → bukan
	 * navigasi ke bab lain — lihat `sectionId` untuk kemungkinan lain.
	 */
	urutanBab: z.number().int().positive().nullable(),
	/**
	 * Non-null → simpul ini setara satu `ChapterSection`, kliknya SWITCH ke
	 * halaman section itu saja (bukan bab utuh) — di bab yang sama dengan
	 * `urutanBab` induknya terdekat. `null` → dekoratif (kelompok kriteria,
	 * atau sub-bab referensi `ChapterTemplate` sebelum outline-nya pernah
	 * di-generate — belum ada konten sungguhan buat dituju).
	 */
	sectionId: z.string().nullable(),
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
	sectionId: string | null = null,
): ChapterTocNode {
	return { id, label, urutanBab, sectionId, children };
}

/** "BAB I.", "BAB II.", … — plafon 20 cukup, tidak ada dokumen LED sebanyak itu babnya. */
const ANGKA_ROMAWI = [
	'',
	'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
	'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
];
function toRomawi(n: number): string {
	return ANGKA_ROMAWI[n] ?? String(n);
}

/** ponytail: plafon 26 sub-bab/bab (A-Z), upgrade AA/AB kalau ada yang lebih. */
function hurufDariUrutan(urutan: number): string {
	return String.fromCharCode(64 + urutan);
}

/**
 * Kelompok kriteria akreditasi di bawah bab ini, judulnya diambil dari
 * `kriteria.kriteria` Set Akreditasi dokumen ini — lihat
 * `guidance-point.entity.ts::kelompokkanKriteria` untuk cara pengelompokannya.
 * Nomor urutnya sekuensial (1, 2, 3, …) mengikuti urutan kemunculan, bukan
 * kode tetap — set kustom bisa punya jumlah kelompok berapa pun.
 *
 * `prefixHuruf` — "C" di pohon fallback (selalu BAB II bagian C). Di pohon
 * dinamis (`buildDynamicToc`) ini huruf sub-bab "Kriteria Akreditasi" yang
 * SUNGGUHAN, apa pun urutannya di bab itu — supaya "C.1, C.2…" tidak
 * menyesatkan kalau posisinya ternyata bukan huruf C.
 */
function simpulKriteriaUntukBab(
	semuaKriteria: Awaited<ReturnType<typeof rubricCriterionAmiRepository.findAll>>,
	urutanBab: number,
	prefixHuruf: string = 'C',
): ChapterTocNode[] {
	const kriteriaBab = semuaKriteria.filter((k) => k.urutanBab.includes(urutanBab));
	return kelompokkanKriteria(kriteriaBab).map((kelompok, indeks) =>
		simpul(`bab-${urutanBab}-kelompok-${indeks + 1}`, `${prefixHuruf}.${indeks + 1}. ${kelompok.judul}`, null),
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

/** Sumber sub-bab netral — dari `ChapterSection` (nyata, navigable) ATAU `SubBabTemplate` (referensi, dekoratif). */
type SubBabItem = { urutan: number; judul: string; sectionId: string | null };

const KRITERIA_RE = /kriteria/i;

/**
 * Anak-anak satu simpul BAB: sub-bab berhuruf (A, B, C…) plus kelompok
 * kriteria akreditasi. Kalau salah satu sub-bab judulnya menyebut "kriteria"
 * (match "C. Kriteria Akreditasi" di kedua contoh pedoman LAM Teknik yang
 * dicek), kelompok kriteria jadi ANAKNYA (level 3 sungguhan, nomor ikut
 * huruf induknya) — bukan sibling rata seperti sebelumnya. Gak ketemu yang
 * cocok → fallback ke sibling rata (perilaku lama, aman buat pedoman
 * institusi lain yang menamainya beda).
 */
function bangunAnakBab(
	urutanBab: number,
	subItems: SubBabItem[],
	semuaKriteria: Awaited<ReturnType<typeof rubricCriterionAmiRepository.findAll>>,
): ChapterTocNode[] {
	const subNodes = subItems.map((item) =>
		simpul(
			`bab-${urutanBab}-sub-${item.urutan}`,
			`${hurufDariUrutan(item.urutan)}. ${item.judul}`,
			null,
			[],
			item.sectionId,
		),
	);

	const indeksKriteria = subItems.findIndex((item) => KRITERIA_RE.test(item.judul));
	const anakKriteria = simpulKriteriaUntukBab(
		semuaKriteria,
		urutanBab,
		indeksKriteria === -1 ? 'C' : hurufDariUrutan(subItems[indeksKriteria].urutan),
	);
	if (anakKriteria.length === 0) return subNodes;
	if (indeksKriteria === -1) return [...subNodes, ...anakKriteria];

	subNodes[indeksKriteria] = { ...subNodes[indeksKriteria], children: anakKriteria };
	return subNodes;
}

/**
 * Bab dari `ChapterTemplate` set ini (worker.py::_handle_ingestion_struktur_dokumen).
 * Sub-bab-nya diutamakan dari `ChapterSection` DOKUMEN INI SENDIRI (outline
 * yang sudah di-generate LLM/manual, `chapterRepository.findSections`) —
 * itulah konten sungguhan yang bisa dituju klik, jadi navigable. Bab yang
 * outline-nya belum pernah dibuat fallback ke `SubBabTemplate` set (referensi
 * resmi pedoman, dekoratif — belum ada konten buat dituju).
 */
async function buildDynamicToc(
	templates: ChapterTemplateEntity[],
	chapters: ChapterEntity[],
	semuaKriteria: Awaited<ReturnType<typeof rubricCriterionAmiRepository.findAll>>,
): Promise<ChapterTocNode[]> {
	return Promise.all(
		templates.map(async (bab) => {
			const chapter = chapters.find((c) => c.urutanBab === bab.urutan);
			const sections = chapter ? await chapterRepository.findSections(chapter.id) : [];
			const subItems: SubBabItem[] =
				sections.length > 0
					? sections.map((s) => ({ urutan: s.urutan, judul: s.judul, sectionId: s.id }))
					: bab.subBab.map((s) => ({ urutan: s.urutan, judul: s.judul, sectionId: null }));

			const anak = bangunAnakBab(bab.urutan, subItems, semuaKriteria);
			return simpul(`bab-${bab.urutan}`, `BAB ${toRomawi(bab.urutan)}. ${bab.judul}`, bab.urutan, anak);
		}),
	);
}

/**
 * Bangun pohon Daftar Isi lengkap untuk satu dokumen. Mengambil struktur
 * bab dari `ChapterTemplate` set ini kalau sudah pernah diekstrak
 * (`accreditationSetRepository.findChapterTemplates`); kosong (belum
 * pernah upload Panduan Penulisan, atau set lama) → fallback ke pohon
 * 4-bab tetap seperti sebelum fitur ini ada. Kelompok kriteria BAB II
 * tetap dari Set Akreditasi yang benar-benar dipilihnya (`accreditationSetId`,
 * dari `ledProjectRepository`). `chapters` (bab NYATA dokumen ini) dipakai
 * cuma di jalur dinamis, buat menautkan tiap `ChapterTemplate` ke
 * `ChapterSection`-nya.
 */
export async function buildChapterToc(
	accreditationSetId: string | null | undefined,
	chapters: ChapterEntity[],
): Promise<ChapterTocNode[]> {
	const [semuaKriteria, templates] = await Promise.all([
		rubricCriterionAmiRepository.findAll(accreditationSetId),
		accreditationSetId
			? accreditationSetRepository.findChapterTemplates(accreditationSetId)
			: Promise.resolve([]),
	]);

	return templates.length > 0
		? buildDynamicToc(templates, chapters, semuaKriteria)
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
 * Jalur dari akar ke simpul yang memuat bab (atau, kalau `sectionId` diisi,
 * section) yang sedang dibuka — dipakai sidebar untuk membentangkan cabang
 * yang sesuai. Kosong bila targetnya tidak terwakili di pohon, atau `nodes`
 * belum sempat termuat (`buildChapterToc` masih berjalan) — bukan kesalahan,
 * hanya belum ada apa-apa untuk dibentangkan.
 */
export function findTocPathForChapter(
	urutanBab: number,
	nodes: ChapterTocNode[],
	sectionId: string | null = null,
): ChapterTocNode[] {
	for (const node of nodes) {
		const cocok = sectionId ? node.sectionId === sectionId : node.urutanBab === urutanBab;
		if (cocok) return [node];
		const jalur = findTocPathForChapter(urutanBab, node.children, sectionId);
		if (jalur.length > 0) return [node, ...jalur];
	}
	return [];
}
