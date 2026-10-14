import { z } from 'zod';

import { type ChapterProgress } from './chapter.entity';
import { chapterSectionStatusEnum } from './chapter-section.entity';

/**
 * Sub-bab versi ringkas untuk tabel Progres per Bab: hanya yang dibutuhkan
 * untuk status dan catatan, tanpa konten maupun panduan (entitas lengkapnya
 * `ChapterSectionEntity`, dimuat Editor Bab per bab).
 */
export const sectionOverviewSchema = z.object({
	id: z.string(),
	parentId: z.string().nullable(),
	urutan: z.number(),
	judul: z.string(),
	marker: z.string().nullable(),
	status: chapterSectionStatusEnum,
	error: z.string().nullable(),
	terkunci: z.boolean(),
	diajukanReviewPada: z.string().nullable(),
	catatanPenjaminMutu: z.string().nullable(),
	catatanOlehNama: z.string().nullable(),
	catatanPada: z.string().nullable(),
});

export type SectionOverviewEntity = z.infer<typeof sectionOverviewSchema>;

/**
 * Progres penulisan oleh manusia, bukan status pembangkitan AI: hasil generate
 * yang belum disentuh (GENERATING/ERROR) tetap "Belum diisi". Keadaan itu hanya
 * jadi petunjuk baris, lihat {@link deriveSectionRowHint}.
 */
export function deriveSectionProgress(
	section: SectionOverviewEntity,
): ChapterProgress {
	if (section.terkunci) return 'TERKUNCI';
	if (section.diajukanReviewPada) return 'MENUNGGU_REVIEW';
	if (section.status === 'GENERATED') return 'SEDANG_DISUSUN';
	return 'BELUM_DIISI';
}

export type SectionRowHint = 'normal' | 'dibangkitkan' | 'gagal';

/**
 * Petunjuk tampilan baris (bukan status): sub-bab yang sedang/gagal dibangkitkan.
 * Diabaikan bila sudah dikunci atau diajukan — saat itu status review lebih
 * relevan bagi pembaca daripada riwayat pembangkitannya.
 */
export function deriveSectionRowHint(
	section: SectionOverviewEntity,
): SectionRowHint {
	if (section.terkunci || section.diajukanReviewPada) return 'normal';
	if (section.status === 'GENERATING') return 'dibangkitkan';
	if (section.status === 'ERROR') return 'gagal';
	return 'normal';
}

export type SectionNode = {
	section: SectionOverviewEntity;
	/** 0 untuk sub-bab tingkat pertama. */
	depth: number;
	children: SectionNode[];
};

/**
 * Susun daftar datar menjadi pohon lewat `parentId`, terurut `urutan`.
 * Sub-bab yatim (induknya tak ada di daftar) dijadikan akar supaya tidak
 * hilang diam-diam; siklus ikut diputus dengan cara yang sama.
 */
export function buildSectionTree(sections: SectionOverviewEntity[]): SectionNode[] {
	const ids = new Set(sections.map((s) => s.id));
	const byParent = new Map<string | null, SectionOverviewEntity[]>();
	for (const section of sections) {
		const key =
			section.parentId !== null &&
			section.parentId !== section.id &&
			ids.has(section.parentId)
				? section.parentId
				: null;
		byParent.set(key, [...(byParent.get(key) ?? []), section]);
	}

	const visited = new Set<string>();
	const build = (parent: string | null, depth: number): SectionNode[] =>
		(byParent.get(parent) ?? [])
			.sort((a, b) => a.urutan - b.urutan)
			.filter((s) => !visited.has(s.id))
			.map((section) => {
				visited.add(section.id);
				return { section, depth, children: build(section.id, depth + 1) };
			});

	return build(null, 0);
}

/**
 * Wadah murni: punya anak dan tidak punya keadaan sendiri. Baris wadah tidak
 * menampilkan status maupun catatan, supaya tidak ada "Belum diisi" yang
 * menyesatkan pada judul yang hanya mengelompokkan.
 */
export function isPureContainer(node: SectionNode): boolean {
	const { section } = node;
	return (
		node.children.length > 0 &&
		section.status === 'PENDING' &&
		deriveSectionProgress(section) === 'BELUM_DIISI' &&
		!section.catatanPenjaminMutu
	);
}
