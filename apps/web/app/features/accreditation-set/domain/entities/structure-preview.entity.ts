import { z } from 'zod';

// Satu node bab/sub-bab/sub-sub-bab di modal "Pilih Struktur Pedoman" --
// pohon FLAT (parentId, bukan nested seperti chapter-template.entity.ts),
// karena ini bisa mewakili tree yang belum punya baris ChapterTemplate/
// SubBabTemplate sungguhan sama sekali (staging_sections punya id sementara
// dotted-order, bukan cuid Prisma -- lihat worker.py::_flatten_bab_list).
export const structureNodeSchema = z.object({
	id: z.string(),
	parentId: z.string().nullable(),
	/** 1 = BAB, lalu sedalam apa pun (seperti dimas). */
	level: z.number().int().min(1),
	order: z.number(),
	title: z.string(),
	/** Penomoran asli Panduan ("C.1", "a)") -- dimas menampilkannya di modal. */
	marker: z.string().nullable(),
	guidance: z.string().nullable(),
	/** Pedoman menyebut LKPS (dimas: lkps_needed/lkps_list di preview). */
	lkpsDibutuhkan: z.boolean(),
	tabelLkps: z.array(z.string()),
	/** gap #2: cuma berarti utk node yg SUDAH commit (status != MENUNGGU_KONFIRMASI)
	 * -- node staging belum punya baris SubBabTemplate sungguhan, selalu `true`. */
	isActive: z.boolean(),
});

export type StructureNodeEntity = z.infer<typeof structureNodeSchema>;

export const structurePreviewSchema = z.object({
	/** `MENUNGGU_KONFIRMASI` = nodes masih staged (belum commit); nilai lain = struktur yang sudah nyata. */
	status: z.string(),
	nodes: z.array(structureNodeSchema),
});

export type StructurePreviewEntity = z.infer<typeof structurePreviewSchema>;
