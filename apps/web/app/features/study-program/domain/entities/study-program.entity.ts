import { z } from 'zod';

/** Jenjang pendidikan prodi (docs/database.md → PROGRAM_STUDI.jenjang). */
export const jenjangEnum = z.enum(['D3', 'D4', 'S1', 'S2', 'S3']);
export type Jenjang = z.infer<typeof jenjangEnum>;

/**
 * Peringkat akreditasi yang tersimpan di DB (tidak lagi ditampilkan di UI).
 * Memakai istilah LAM Teknik/BAN-PT
 * yang berlaku sekarang; peringkat lama (A/B/C) sengaja tidak disediakan karena
 * dokumen LED yang disusun di sini selalu memakai instrumen baru.
 */
export const peringkatAkreditasiEnum = z.enum([
	'UNGGUL',
	'BAIK_SEKALI',
	'BAIK',
	'BELUM_TERAKREDITASI',
]);
export type PeringkatAkreditasi = z.infer<typeof peringkatAkreditasiEnum>;

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
	/**
	 * Peringkat, nomor SK, dan masa berlaku akreditasi tidak lagi ditampilkan
	 * maupun ditanyakan di UI (tidak dipakai pembangkitan AI maupun penilaian
	 * AMI). Tetap dibaca longgar supaya payload lama masih terurai.
	 */
	peringkatAkreditasi: peringkatAkreditasiEnum.optional(),
	nomorSkAkreditasi: z.string().nullish(),
	berlakuSampaiAkreditasi: z.string().nullish(),
	createdAt: z.string(),
});

export type StudyProgramEntity = z.infer<typeof studyProgramSchema>;
