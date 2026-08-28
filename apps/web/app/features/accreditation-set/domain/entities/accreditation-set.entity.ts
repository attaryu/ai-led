import { z } from 'zod';

/**
 * Tiga jenis berkas acuan dalam satu set, mengikuti `TipePanduan` di
 * docs/database.md → PANDUAN_REFERENSI. Ketiganya menjawab pertanyaan yang
 * sama — menilai ke lembaga mana, siklus kapan — sehingga selalu dipilih
 * sebagai satu paket, bukan satu per satu.
 */
export const setDocumentTypeEnum = z.enum([
	'DOKUMEN_RUBRIK',
	'PANDUAN_LAM',
	'TEMPLATE_LKPS',
]);
export type SetDocumentType = z.infer<typeof setDocumentTypeEnum>;

export const SET_DOCUMENT_TYPE_LABEL: Record<SetDocumentType, string> = {
	DOKUMEN_RUBRIK: 'Dokumen Rubrik',
	PANDUAN_LAM: 'Panduan LAM',
	TEMPLATE_LKPS: 'Template LKPS',
};

export const SET_DOCUMENT_TYPE_HINT: Record<SetDocumentType, string> = {
	DOKUMEN_RUBRIK: 'Kriteria penilaian beserta level skornya',
	PANDUAN_LAM: 'Poin panduan penyusunan dari lembaga penilai',
	TEMPLATE_LKPS: 'Format tabel data kuantitatif',
};

/**
 * Urutan slot di layar, sekaligus satu-satunya sumber kebenaran bahwa slotnya
 * ada tiga. Tampilan mengulang daftar ini alih-alih menulis ketiga slot satu
 * per satu, supaya penambahan jenis berkas cukup disentuh di sini.
 */
export const SET_DOCUMENT_TYPES = setDocumentTypeEnum.options;

/**
 * `DRAF` berarti isinya belum ditinjau, jadi belum boleh dipilih proyek mana
 * pun. `SIAP` mengunci isinya — lihat catatan pada `accreditationSetSchema`.
 */
export const setStatusEnum = z.enum(['DRAF', 'SIAP']);
export type SetStatus = z.infer<typeof setStatusEnum>;

export const SET_STATUS_LABEL: Record<SetStatus, string> = {
	DRAF: 'Draf',
	SIAP: 'Siap',
};

export const accreditationSetDocumentSchema = z.object({
	tipe: setDocumentTypeEnum,
	namaBerkas: z.string(),
	/** Ekstensi tanpa titik, misal `pdf`. Dipakai untuk ikon dan penyaringan. */
	tipeBerkas: z.string(),
	ukuranBytes: z.number(),
	diunggahPada: z.string(),
	diunggahOleh: z.string(),
});

export type AccreditationSetDocument = z.infer<
	typeof accreditationSetDocumentSchema
>;

/**
 * Satu paket acuan penilaian — rubrik, panduan, dan template dari satu lembaga
 * untuk satu siklus akreditasi.
 *
 * Set disimpan di tingkat tenant tapi dipilih per proyek Dokumen LED, karena
 * satu universitas bisa punya prodi di bawah lembaga penilai yang berbeda, dan
 * dokumen dari siklus berbeda dinilai dengan rubrik yang berbeda pula.
 *
 * Set yang sudah dipakai proyek tidak boleh diubah isinya: hasil penilaian
 * menunjuk ke kriteria, sehingga kriteria yang berubah diam-diam mengubah arti
 * skor yang sudah tersimpan. Perubahan dilakukan dengan menduplikasi set jadi
 * versi baru, bukan menyunting yang lama.
 */
export const accreditationSetSchema = z.object({
	id: z.string(),
	nama: z
		.string()
		.min(1, 'Nama set wajib diisi')
		.max(100, 'Nama set maksimal 100 karakter'),
	/** Teks bebas, bukan enum: lembaga penilai baru bisa muncul kapan saja. */
	lembaga: z
		.string()
		.min(1, 'Lembaga penilai wajib diisi')
		.max(100, 'Lembaga penilai maksimal 100 karakter'),
	tahunSiklus: z
		.number({ message: 'Tahun siklus wajib diisi' })
		.int('Tahun siklus harus bilangan bulat')
		.min(2000, 'Tahun siklus minimal 2000')
		.max(2100, 'Tahun siklus maksimal 2100'),
	status: setStatusEnum,
	dokumen: z.array(accreditationSetDocumentSchema),
	createdAt: z.string(),
});

export type AccreditationSetEntity = z.infer<typeof accreditationSetSchema>;

export type SetCompleteness = {
	/** Jenis berkas yang sudah terisi, urut mengikuti `SET_DOCUMENT_TYPES`. */
	terisi: SetDocumentType[];
	kosong: SetDocumentType[];
	lengkap: boolean;
};

/**
 * Kelengkapan berkas satu set. Turunan, bukan kolom — alasannya sama dengan
 * masa berlaku akreditasi di `study-program.entity.ts`: menyimpannya berarti
 * ada nilai kedua yang harus dijaga sinkron dengan daftar berkasnya, dan begitu
 * ada satu jalur unggah yang lupa memperbaruinya, daftar mulai berbohong.
 */
export function deriveSetCompleteness(
	set: AccreditationSetEntity,
): SetCompleteness {
	const terisi = SET_DOCUMENT_TYPES.filter((tipe) =>
		set.dokumen.some((d) => d.tipe === tipe),
	);
	const kosong = SET_DOCUMENT_TYPES.filter((tipe) => !terisi.includes(tipe));

	return { terisi, kosong, lengkap: kosong.length === 0 };
}

/** Berkas pada satu slot, atau `null` bila slotnya masih kosong. */
export function findSetDocument(
	set: AccreditationSetEntity,
	tipe: SetDocumentType,
): AccreditationSetDocument | null {
	return set.dokumen.find((d) => d.tipe === tipe) ?? null;
}
