import { z } from 'zod';

/** Jenjang pendidikan prodi (docs/database.md → PROGRAM_STUDI.jenjang). */
export const jenjangEnum = z.enum(['D3', 'D4', 'S1', 'S2', 'S3']);
export type Jenjang = z.infer<typeof jenjangEnum>;

export const studyProgramSchema = z.object({
	id: z.string(),
	studyProgramName: z
		.string()
		.min(1, 'Nama prodi wajib diisi')
		.max(100, 'Nama prodi maksimal 100 karakter'),
	/** Kode prodi PDDikti, misal "55201". */
	kode: z
		.string()
		.min(1, 'Kode prodi wajib diisi')
		.max(20, 'Kode prodi maksimal 20 karakter'),
	jenjang: jenjangEnum,
	fakultas: z
		.string()
		.min(1, 'Fakultas wajib diisi')
		.max(100, 'Fakultas maksimal 100 karakter'),
	/**
	 * Nama penanggung jawab prodi sebagai teks bebas, sengaja bukan relasi ke
	 * `USER`: ketua prodi belum tentu punya akun di aplikasi ini.
	 */
	ketuaProdi: z
		.string()
		.min(1, 'Ketua prodi wajib diisi')
		.max(100, 'Ketua prodi maksimal 100 karakter'),
	// Peringkat, nomor SK, dan masa berlaku akreditasi dari backend tidak dipakai UI.
	createdAt: z.string(),
});

export type StudyProgramEntity = z.infer<typeof studyProgramSchema>;
