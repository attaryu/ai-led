import { z } from 'zod';

export const studyProgramSchema = z.object({
	id: z.string(),
	studyProgramName: z
		.string()
		.min(1, 'Nama prodi wajib diisi')
		.max(100, 'Nama prodi maksimal 100 karakter'),
	createdAt: z.string(),
});

export type StudyProgramEntity = z.infer<typeof studyProgramSchema>;
