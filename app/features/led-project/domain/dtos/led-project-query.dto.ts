import { z } from 'zod';

import { type LedProjectEntity } from '../entities/led-project.entity';

/**
 * Parameter daftar Dokumen LED — bentuknya sengaja menyerupai query string API
 * nanti (`?q=&page=&limit=&sort=&dir=`), sama seperti daftar bukti dukung,
 * supaya saat repository berpindah ke jaringan yang berubah hanya isi
 * fungsinya, bukan pemanggilnya.
 */
export const ledProjectQuerySchema = z.object({
	/** Batasi ke satu prodi; kosong berarti lintas prodi. */
	studyProgramId: z.string().optional(),
	/** Kata kunci; dicocokkan ke judul, nama prodi, dan tahun akademik. */
	q: z.string().optional(),
	sort: z.string().optional(),
	dir: z.enum(['asc', 'desc']).optional(),
	page: z.number().int().min(1),
	limit: z.number().int().min(1),
});

export type LedProjectQueryDto = z.infer<typeof ledProjectQuerySchema>;

/** Bentuk balikan daftar berhalaman; `total` dipakai menghitung jumlah halaman. */
export type LedProjectPage = {
	items: LedProjectEntity[];
	total: number;
};
