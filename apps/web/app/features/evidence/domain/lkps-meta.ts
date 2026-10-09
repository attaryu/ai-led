/**
 * Metadata wajib saat mengunggah LKPS: nama dan tahun/periode.
 *
 * Satu prodi boleh punya beberapa LKPS (mis. satu per tahun akademik) dan tiap Dokumen
 * LED memilih salah satunya, jadi LKPS harus bisa dibedakan -- nama berkas saja tidak
 * cukup ("lkps_final_v2.xlsx" tidak menjawab "LKPS tahun berapa?"). Aturan yang sama
 * ditegakkan ulang di `BuktiDukungService.create` (backend); ini hanya agar pesannya
 * muncul di kolomnya sebelum permintaan dikirim.
 */
export const LKPS_NAMA_MAX = 255;
export const LKPS_PERIODE_MAX = 40;

export type LkpsMeta = { nama: string; periode: string };

/** Pesan galat per kolom; objek kosong berarti valid. */
export function validateLkpsMeta(meta: LkpsMeta): Partial<Record<keyof LkpsMeta, string>> {
	const galat: Partial<Record<keyof LkpsMeta, string>> = {};
	const nama = meta.nama.trim();
	const periode = meta.periode.trim();

	if (!nama) galat.nama = 'Nama LKPS wajib diisi';
	else if (nama.length > LKPS_NAMA_MAX) galat.nama = `Nama LKPS maksimal ${LKPS_NAMA_MAX} karakter`;

	if (!periode) galat.periode = 'Tahun/periode wajib diisi';
	else if (periode.length > LKPS_PERIODE_MAX) galat.periode = `Tahun/periode maksimal ${LKPS_PERIODE_MAX} karakter`;

	return galat;
}

/** Saran nama dari nama berkas: tanpa ekstensi, garis bawah jadi spasi. Pengguna tetap bisa mengubahnya. */
export function sarankanNamaLkps(namaBerkas: string): string {
	return namaBerkas.replace(/\.(xlsx|xls)$/i, '').replace(/_/g, ' ').trim();
}

/** Label satu LKPS untuk daftar/pilihan: "Nama (Periode)"; periode kosong (LKPS lama) dilewati. */
export function labelLkps(lkps: { namaDokumen: string; periode: string | null }): string {
	return lkps.periode ? `${lkps.namaDokumen} (${lkps.periode})` : lkps.namaDokumen;
}
