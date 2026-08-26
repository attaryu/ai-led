import { z } from 'zod';
import {
	ledProjectSchema,
	tahunMulaiSchema,
} from '../entities/led-project.entity';

/**
 * `tenggat` diterima sebagai string biasa karena `<input type="date">` memakai
 * string kosong untuk "tidak diisi"; normalisasinya ke `null` terjadi saat
 * disimpan.
 *
 * `tahunAkademik` sengaja **tidak** ikut dipetik dari entity. Formulir meminta
 * satu angka tahun mulai (`tahunMulai`), dan `YYYY/YYYY` yang tersimpan disusun
 * darinya saat submit — supaya tahun akhir tidak pernah bisa diketik salah.
 */
export const createLedProjectSchema = ledProjectSchema
	.pick({
		studyProgramId: true,
		judul: true,
	})
	.extend({
		tahunMulai: tahunMulaiSchema,
		tenggat: z.string(),
	});

export type CreateLedProjectDto = z.infer<typeof createLedProjectSchema>;
