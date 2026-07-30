import { z } from 'zod';
import { studyProgramSchema } from '../entities/study-program.entity';

export const updateStudyProgramSchema = studyProgramSchema.pick({
	studyProgramName: true,
});

export type UpdateStudyProgramDto = z.infer<typeof updateStudyProgramSchema>;
