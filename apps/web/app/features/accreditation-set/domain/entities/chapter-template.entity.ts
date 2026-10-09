import { z } from 'zod';

// Struktur bab/sub-bab resmi diekstrak LLM dari dokumen PANDUAN_LAM set ini
// (worker.py::_handle_ingestion_struktur_dokumen). Kosong berarti belum
// pernah diekstrak -- pemanggil fallback ke struktur bab statis lama.
// `anak` bersarang sedalam apa pun (tiap node Panduan jadi section, seperti dimas) --
// lihat SubBabTemplate.parentId di schema.prisma.


type SubBabTemplateShape = {
	id: string;
	urutan: number;
	judul: string;
	/** Penomoran asli Panduan ("C.1", "a)"); `null` utk ekstraksi lama. */
	marker: string | null;
	panduan: string;
	/** gap #2: false = dikecualikan dari outline BARU tanpa re-extract Panduan. */
	aktif: boolean;
	anak: SubBabTemplateShape[];
};

export const subBabTemplateSchema: z.ZodType<SubBabTemplateShape> = z.object({
	id: z.string(),
	urutan: z.number().int().positive(),
	judul: z.string(),
	marker: z.string().nullable(),
	panduan: z.string(),
	aktif: z.boolean(),
	anak: z.lazy(() => z.array(subBabTemplateSchema)),
});

export const chapterTemplateSchema = z.object({
	id: z.string(),
	urutan: z.number().int().positive(),
	judul: z.string(),
	/** Pengantar BAB dari Panduan (tidak di-generate, cuma dibaca). */
	pengantar: z.string().nullable(),
	subBab: z.array(subBabTemplateSchema),
});

export type ChapterTemplateEntity = z.infer<typeof chapterTemplateSchema>;
