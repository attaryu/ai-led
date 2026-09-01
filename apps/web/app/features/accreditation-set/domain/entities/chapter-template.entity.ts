import { z } from 'zod';

// Struktur bab/sub-bab resmi diekstrak LLM dari dokumen PANDUAN_LAM set ini
// (worker.py::_handle_ingestion_struktur_dokumen). Kosong berarti belum
// pernah diekstrak -- pemanggil fallback ke struktur bab statis lama.
export const subBabTemplateSchema = z.object({
	id: z.string(),
	urutan: z.number().int().positive(),
	judul: z.string(),
	panduan: z.string(),
});

export const chapterTemplateSchema = z.object({
	id: z.string(),
	urutan: z.number().int().positive(),
	judul: z.string(),
	subBab: z.array(subBabTemplateSchema),
});

export type ChapterTemplateEntity = z.infer<typeof chapterTemplateSchema>;
