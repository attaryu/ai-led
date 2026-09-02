import { z } from 'zod';

// Struktur bab/sub-bab resmi diekstrak LLM dari dokumen PANDUAN_LAM set ini
// (worker.py::_handle_ingestion_struktur_dokumen). Kosong berarti belum
// pernah diekstrak -- pemanggil fallback ke struktur bab statis lama.
// `anak` (sub-sub-bab, mis. "C.1" di bawah "C. Kriteria Akreditasi") cuma
// satu tingkat -- lihat SubBabTemplate.parentId di schema.prisma.
type SubBabTemplateShape = {
	id: string;
	urutan: number;
	judul: string;
	panduan: string;
	anak: SubBabTemplateShape[];
};

export const subBabTemplateSchema: z.ZodType<SubBabTemplateShape> = z.object({
	id: z.string(),
	urutan: z.number().int().positive(),
	judul: z.string(),
	panduan: z.string(),
	anak: z.lazy(() => z.array(subBabTemplateSchema)),
});

export const chapterTemplateSchema = z.object({
	id: z.string(),
	urutan: z.number().int().positive(),
	judul: z.string(),
	subBab: z.array(subBabTemplateSchema),
});

export type ChapterTemplateEntity = z.infer<typeof chapterTemplateSchema>;
