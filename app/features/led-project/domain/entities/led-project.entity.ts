import { z } from 'zod';

export const ledProjectStatusEnum = z.enum(['DRAFT', 'REVIEW', 'SELESAI']);
export type LedProjectStatus = z.infer<typeof ledProjectStatusEnum>;

export const ledProjectSchema = z.object({
	id: z.string(),
	studyProgramId: z.string().min(1, 'Program studi wajib dipilih'),
	studyProgramName: z.string().min(1, 'Nama program studi wajib diisi'),
	judul: z.string().min(1, 'Judul proyek wajib diisi').max(200, 'Judul proyek maksimal 200 karakter'),
	tahunAkademik: z
		.string()
		.min(1, 'Tahun akademik wajib diisi')
		.regex(/^\d{4}\/\d{4}$/, 'Format tahun akademik harus YYYY/YYYY (contoh: 2025/2026)'),
	statusKeseluruhan: ledProjectStatusEnum,
	createdAt: z.string(),
});

export type LedProjectEntity = z.infer<typeof ledProjectSchema>;
