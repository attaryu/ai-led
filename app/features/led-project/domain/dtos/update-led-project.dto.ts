import { z } from 'zod';
import { ledProjectSchema } from '../entities/led-project.entity';

export const updateLedProjectSchema = ledProjectSchema.pick({
	studyProgramId: true,
	judul: true,
	tahunAkademik: true,
	statusKeseluruhan: true,
});

export type UpdateLedProjectDto = z.infer<typeof updateLedProjectSchema>;
