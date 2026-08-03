import { z } from 'zod';
import { ledProjectSchema } from '../entities/led-project.entity';

export const createLedProjectSchema = ledProjectSchema.pick({
	studyProgramId: true,
	judul: true,
	tahunAkademik: true,
});

export type CreateLedProjectDto = z.infer<typeof createLedProjectSchema>;
