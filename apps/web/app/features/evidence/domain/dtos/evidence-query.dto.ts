import { z } from 'zod';

import { evidenceSchema } from '../entities/evidence.entity';
import { type EvidenceNode } from '../entities/evidence-folder.entity';

/**
 * Parameter daftar bukti dukung — bentuknya sengaja dibuat seperti query string
 * API nanti (`?q=&page=&limit=&sort=&dir=`), supaya saat repository berpindah
 * ke jaringan yang berubah hanya isi fungsinya, bukan pemanggilnya.
 */
export const evidenceQuerySchema = evidenceSchema
	.pick({ ownerTipe: true, tenantId: true, studyProgramId: true })
	.partial({ tenantId: true, studyProgramId: true })
	.extend({
		/**
		 * Folder yang sedang dijelajahi; `null`/tak diisi = akar cakupannya
		 * (docs/application_flow.md §4.6a). **Diabaikan saat `q` terisi**, karena
		 * pencarian memang merata ke seluruh cakupan.
		 */
		folderId: z.string().nullable().optional(),
		/** Kata kunci; dicocokkan ke `namaDokumen`, pengunggah, tipe, dan nama folder. */
		q: z.string().optional(),
		sort: z.string().optional(),
		dir: z.enum(['asc', 'desc']).optional(),
		page: z.number().int().min(1),
		limit: z.number().int().min(1),
	});

export type EvidenceQueryDto = z.infer<typeof evidenceQuerySchema>;

/**
 * Bentuk balikan daftar berhalaman; `total` dipakai menghitung jumlah halaman.
 *
 * Isinya {@link EvidenceNode}, bukan `EvidenceEntity[]`, sejak perpustakaan punya
 * folder: satu halaman bisa memuat folder dan berkas berdampingan. Yang tetap
 * berupa berkas murni adalah koleksi penyimpanannya — lihat kepala
 * `evidence-folder.entity.ts` untuk kenapa perbedaan itu penting.
 */
export type EvidencePage = {
	items: EvidenceNode[];
	total: number;
};
