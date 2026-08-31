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
		/**
		 * Acuan penilaian wajib dipilih sejak dokumen dibuat.
		 *
		 * Lembaga penilai menerbitkan panduan, template, dan rubrik sebagai satu
		 * paket untuk satu siklus, jadi dalam keadaan normal acuannya memang sudah
		 * ada di tangan sebelum penyusunan dibuka. Dokumen yang lahir tanpa acuan
		 * hanya akan berjalan tanpa panduan sampai seseorang teringat memilihnya.
		 *
		 * Wajib di sini saja, tidak di entitas dokumennya: dokumen yang sudah ada
		 * sebelum aturan ini berlaku tetap boleh tidak punya acuan, dan halaman
		 * ruang kerjanya punya tampilan tersendiri untuk keadaan itu.
		 */
		accreditationSetId: z.string().min(1, 'Acuan penilaian wajib dipilih'),
	});

export type CreateLedProjectDto = z.infer<typeof createLedProjectSchema>;
