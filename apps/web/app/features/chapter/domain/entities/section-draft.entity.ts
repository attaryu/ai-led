import { z } from 'zod';

/**
 * Satu checkpoint SECTION (`writing_section_drafts`, docs/database.md §6) --
 * pasangan section-level dari {@link ../entities/chapter-draft.entity ChapterDraftEntity},
 * yang tetap bab-level untuk arsip bukti dukung/ragas (tidak digantikan).
 *
 * Lebih tipis dengan sengaja: checkpoint per-section tidak menyimpan snapshot
 * bukti dukung atau skor ragas -- itu tetap milik alur generate bab lama.
 * Isinya (`contentSnapshot`) tidak pernah dikirim ke client kecuali sesaat
 * lewat respons pulihkan, jadi tidak dimodelkan di sini.
 */
export const sectionDraftSumberEnum = z.enum(['AI', 'MANUAL']);
export type SectionDraftSumber = z.infer<typeof sectionDraftSumberEnum>;

export const sectionDraftSchema = z.object({
	id: z.string(),
	sectionId: z.string(),
	/** Nomor urut checkpoint **dalam satu section**, mulai dari 1. */
	versi: z.number().int().positive(),
	/** `null` bila user tidak memberi nama; tampilan jatuh ke {@link labelSectionDraft}. */
	label: z.string().nullable(),
	sumber: sectionDraftSumberEnum,
	dibuatOlehNama: z.string(),
	/** ISO. */
	dibuatPada: z.string(),
	/** HTML isi versi ini -- pratinjau baca-saja (dimas "Melihat versi lama"). */
	konten: z.string().nullable(),
	/** Versi yang sekarang jadi isi section -- badge "Aktif". */
	aktif: z.boolean(),
});

export type SectionDraftEntity = z.infer<typeof sectionDraftSchema>;

export function labelSectionDraft(draft: SectionDraftEntity): string {
	return draft.label ?? `Versi ${draft.versi}`;
}
