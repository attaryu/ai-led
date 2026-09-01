import { z } from 'zod';

// Section outline yang di-generate LLM, dituntun kelompok kriteria rubrik bab ini.
export const chapterSectionStatusEnum = z.enum(['PENDING', 'GENERATING', 'GENERATED', 'ERROR']);
export type ChapterSectionStatus = z.infer<typeof chapterSectionStatusEnum>;

export const chapterSectionSchema = z.object({
	id: z.string(),
	chapterId: z.string(),
	urutan: z.number().int().positive(),
	judul: z.string(),
	panduan: z.string(),
	status: chapterSectionStatusEnum,
	konten: z.string().nullable(),
	error: z.string().nullable(),
});

export type ChapterSectionEntity = z.infer<typeof chapterSectionSchema>;

export const chapterSectionStatusLabels: Record<ChapterSectionStatus, string> = {
	PENDING: 'Belum digenerate',
	GENERATING: 'Sedang digenerate…',
	GENERATED: 'Selesai',
	ERROR: 'Gagal',
};
