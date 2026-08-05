import { z } from 'zod';

import { daysUntil } from '~/core/lib/format-time';

/** Jenjang pendidikan prodi (docs/database.md → PROGRAM_STUDI.jenjang). */
export const jenjangEnum = z.enum(['D3', 'D4', 'S1', 'S2', 'S3']);
export type Jenjang = z.infer<typeof jenjangEnum>;

/**
 * Peringkat akreditasi yang sedang berlaku. Memakai istilah LAM Teknik/BAN-PT
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

export const PERINGKAT_AKREDITASI_LABEL: Record<PeringkatAkreditasi, string> = {
	UNGGUL: 'Unggul',
	BAIK_SEKALI: 'Baik Sekali',
	BAIK: 'Baik',
	BELUM_TERAKREDITASI: 'Belum Terakreditasi',
};

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
	peringkatAkreditasi: peringkatAkreditasiEnum,
	/** Nomor SK peringkat yang berlaku; `null` bila belum terakreditasi. */
	nomorSkAkreditasi: z.string().nullable(),
	/** ISO. `null` bila belum terakreditasi — bukan berarti sudah kedaluwarsa. */
	berlakuSampaiAkreditasi: z.string().nullable(),
	createdAt: z.string(),
});

export type StudyProgramEntity = z.infer<typeof studyProgramSchema>;

/**
 * Ambang "akreditasi sudah dekat". Satu tahun dipilih karena penyusunan LED
 * memang berjalan bulanan — di bawah setahun, siklus berikutnya seharusnya
 * sudah berjalan.
 */
export const ACCREDITATION_EXPIRY_SOON_DAYS = 365;

export const accreditationUrgencyEnum = z.enum([
	'AMAN',
	'MENDEKATI',
	'KEDALUWARSA',
]);
export type AccreditationUrgency = z.infer<typeof accreditationUrgencyEnum>;

export type AccreditationValidity = {
	sisaHari: number;
	urgensi: AccreditationUrgency;
};

/**
 * Sisa masa berlaku akreditasi. Turunan, bukan kolom — alasannya sama dengan
 * status bab di docs/application_flow.md §6.1a: menyimpannya berarti ada nilai
 * kedua yang harus dijaga tetap sinkron dengan tanggalnya, dan begitu ada satu
 * jalur yang lupa memperbaruinya dashboard mulai berbohong.
 *
 * `null` untuk prodi yang belum terakreditasi: tidak punya masa berlaku itu
 * berbeda dari masa berlaku yang sudah habis, dan keduanya tidak boleh
 * ditampilkan dengan cara yang sama.
 */
export function deriveAccreditationValidity(
	berlakuSampai: string | null,
	now: number = Date.now(),
): AccreditationValidity | null {
	if (!berlakuSampai) return null;

	const sisaHari = daysUntil(berlakuSampai, now);

	return {
		sisaHari,
		urgensi:
			sisaHari < 0
				? 'KEDALUWARSA'
				: sisaHari <= ACCREDITATION_EXPIRY_SOON_DAYS
					? 'MENDEKATI'
					: 'AMAN',
	};
}
