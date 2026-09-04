import { z } from 'zod';
import { studyProgramSchema } from '../entities/study-program.entity';

/**
 * Formulir memakai string kosong untuk field opsional (input HTML tidak punya
 * `null`), jadi keduanya diterima di sini dan dinormalkan saat disimpan.
 */
export const createStudyProgramSchema = studyProgramSchema
	.pick({
		studyProgramName: true,
		kode: true,
		jenjang: true,
		fakultas: true,
		ketuaProdi: true,
		peringkatAkreditasi: true,
	})
	.extend({
		nomorSkAkreditasi: z.string(),
		berlakuSampaiAkreditasi: z.string(),
	});

export type CreateStudyProgramDto = z.infer<typeof createStudyProgramSchema>;
