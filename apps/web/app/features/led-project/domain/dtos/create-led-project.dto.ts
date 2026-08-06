import { z } from 'zod';
import { ledProjectSchema } from '../entities/led-project.entity';

/**
 * `tenggat` diterima sebagai string biasa karena `<input type="date">` memakai
 * string kosong untuk "tidak diisi"; normalisasinya ke `null` terjadi saat
 * disimpan.
 */
export const createLedProjectSchema = ledProjectSchema
	.pick({
		studyProgramId: true,
		judul: true,
		tahunAkademik: true,
	})
	.extend({
		tenggat: z.string(),
	});

export type CreateLedProjectDto = z.infer<typeof createLedProjectSchema>;
