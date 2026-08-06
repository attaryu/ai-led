import { z } from 'zod';

import {
	evidenceSchema,
	type EvidenceEntity,
} from '../entities/evidence.entity';

/**
 * Parameter daftar bukti dukung — bentuknya sengaja dibuat seperti query string
 * API nanti (`?q=&page=&limit=&sort=&dir=`), supaya saat repository berpindah
 * ke jaringan yang berubah hanya isi fungsinya, bukan pemanggilnya.
 */
export const evidenceQuerySchema = evidenceSchema
	.pick({ ownerTipe: true, tenantId: true, studyProgramId: true })
	.partial({ tenantId: true, studyProgramId: true })
	.extend({
		/** Kata kunci; dicocokkan ke `namaDokumen`. */
		q: z.string().optional(),
		sort: z.string().optional(),
		dir: z.enum(['asc', 'desc']).optional(),
		page: z.number().int().min(1),
		limit: z.number().int().min(1),
	});

export type EvidenceQueryDto = z.infer<typeof evidenceQuerySchema>;

/** Bentuk balikan daftar berhalaman; `total` dipakai menghitung jumlah halaman. */
export type EvidencePage = {
	items: EvidenceEntity[];
	total: number;
};
