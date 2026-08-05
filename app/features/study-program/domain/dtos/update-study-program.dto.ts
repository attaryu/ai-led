import { z } from 'zod';
import { createStudyProgramSchema } from './create-study-program.dto';

/** Bentuknya sama dengan pembuatan — seluruh identitas prodi bisa dikoreksi. */
export const updateStudyProgramSchema = createStudyProgramSchema;

export type UpdateStudyProgramDto = z.infer<typeof updateStudyProgramSchema>;
