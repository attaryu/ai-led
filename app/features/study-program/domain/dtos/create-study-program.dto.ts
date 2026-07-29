import { z } from 'zod';
import { studyProgramSchema } from '../entities/study-program.entity';

export const createStudyProgramSchema = studyProgramSchema.pick({
	studyProgramName: true,
});

export type CreateStudyProgramDto = z.infer<typeof createStudyProgramSchema>;
