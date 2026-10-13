import { z } from 'zod';
import { studyProgramSchema } from '../entities/study-program.entity';

/**
 * Peringkat, nomor SK, dan masa berlaku akreditasi tidak ikut ditanyakan lagi;
 * backend memberi nilai bawaan dan edit tidak menyentuhnya.
 */
export const createStudyProgramSchema = studyProgramSchema.pick({
	studyProgramName: true,
	kode: true,
	jenjang: true,
	fakultas: true,
	ketuaProdi: true,
});

export type CreateStudyProgramDto = z.infer<typeof createStudyProgramSchema>;
