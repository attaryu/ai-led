import {
	deriveChapterProgress,
	type ChapterEntity,
	type ChapterProgress,
} from './chapter.entity';
import {
	buildSectionTree,
	deriveSectionProgress,
	deriveSectionRowHint,
	isPureContainer,
	type SectionNode,
	type SectionRowHint,
} from './section-overview.entity';
// Berkas tersendiri: `chapter.entity` mengimpor skema sub-bab, jadi memanggil
// `deriveChapterProgress` dari berkas sub-bab akan membuat impor melingkar.

export type TocNodeStatus = {
	progress: ChapterProgress;
	hint: SectionRowHint;
	/** Pesan galat pembangkitan, untuk tooltip petunjuk `gagal`. */
	error: string | null;
};

/**
 * Status satu butir Daftar Isi Editor, dengan aturan yang sama seperti tabel
 * Progres per Bab. `null` bila butirnya tak punya status nyata: simpul
 * dekoratif (kelompok kriteria, sub-bab templat tanpa outline), sub-bab yang
 * tak ditemukan di bab, dan wadah murni.
 */
export function deriveTocNodeStatus(
	node: { urutanBab: number | null; sectionId: string | null },
	chapters: ChapterEntity[],
): TocNodeStatus | null {
	if (node.sectionId) {
		const chapter = chapters.find((c) =>
			c.sections.some((s) => s.id === node.sectionId),
		);
		if (!chapter) return null;
		const cari = (nodes: SectionNode[]): SectionNode | undefined => {
			for (const n of nodes) {
				if (n.section.id === node.sectionId) return n;
				const dalam = cari(n.children);
				if (dalam) return dalam;
			}
			return undefined;
		};
		const ditemukan = cari(buildSectionTree(chapter.sections));
		if (!ditemukan || isPureContainer(ditemukan)) return null;
		return {
			progress: deriveSectionProgress(ditemukan.section),
			hint: deriveSectionRowHint(ditemukan.section),
			error: ditemukan.section.error,
		};
	}
	if (node.urutanBab !== null) {
		const chapter = chapters.find((c) => c.urutanBab === node.urutanBab);
		if (!chapter) return null;
		return { progress: deriveChapterProgress(chapter), hint: 'normal', error: null };
	}
	return null;
}
