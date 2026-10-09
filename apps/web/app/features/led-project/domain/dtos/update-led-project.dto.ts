import { z } from 'zod';
import {
	ledProjectSchema,
	tahunMulaiSchema,
} from '../entities/led-project.entity';

/**
 * Bentuknya mengikuti `createLedProjectSchema`, termasuk alasan `tahunMulai`
 * menggantikan `tahunAkademik`: yang diketik satu angka tahun, sisanya disusun.
 */
export const updateLedProjectSchema = ledProjectSchema
	.pick({
		studyProgramId: true,
		judul: true,
		statusKeseluruhan: true,
	})
	.extend({
		tahunMulai: tahunMulaiSchema,
		tenggat: z.string(),
		lkpsEvidenceId: z.string(),
	});

export type UpdateLedProjectDto = z.infer<typeof updateLedProjectSchema>;
