import { z } from 'zod';

/**
 * Keputusan Penjamin Mutu atas satu indikator — **penilaian finalnya**.
 *
 * Belum punya tabel di docs/database.md; celahnya dicatat di §12b bersama dua
 * celah `AssessmentSession` lainnya.
 *
 * **Kenapa "keputusan", bukan "koreksi".** Versi pertama entitas ini hanya
 * mencatat perubahan angka, sehingga "tidak ada baris" berarti dua hal sekaligus:
 * belum ada yang melihat indikator ini, **atau** sudah dilihat dan AI-nya
 * dianggap benar. Untuk dokumen akreditasi, membiarkan keduanya tampak sama itu
 * cacat serius — Penjamin Mutu tidak bisa menjawab "berapa indikator yang masih
 * perlu saya periksa?", dan pembaca dokumen tidak bisa membedakan angka yang
 * sudah dipertanggungjawabkan manusia dari angka yang lolos begitu saja.
 *
 * Maka barisnya menyatakan **peninjauan**, dan mengoreksi cuma salah satu
 * hasilnya di samping menyetujui.
 *
 * **Kenapa lapis tersendiri, bukan kolom di `IndicatorResult`.** Baris hasil
 * AI kebijakannya main timpa: menjalankan penilaian ulang menggantinya. Kalau
 * keputusan manusia ikut tinggal di sana, satu klik "Nilai Ulang" akan
 * menghapusnya tanpa jejak — kelas cacat yang sama dengan `checkpointAktifId`
 * yang dulu tidak dibersihkan generate, dan yang paling mahal di sini karena
 * yang hilang adalah pertimbangan orang, bukan angka yang bisa dihitung ulang.
 *
 * **Kuncinya `(dokumenId, indikatorNo)` — menempel ke dokumen, bukan ke sesi.**
 * Itulah yang membuat keputusan bertahan melewati penilaian ulang. Sesi tempat
 * ia dibuat tetap dicatat, tapi sebagai keterangan, bukan sebagai pemilik.
 */

/**
 * Alasan wajib **hanya saat mengoreksi**, dan pesannya tinggal di entitas sesuai
 * aturan arsitektur.
 *
 * Wajib untuk koreksi karena koreksi mengganti satu angka yang punya justifikasi
 * tertulis (AI selalu menuliskannya) dengan angka yang tidak punya. Yang
 * membaca dokumen ini berbulan-bulan kemudian tidak punya cara lain mengetahui
 * kenapa keduanya berbeda.
 *
 * **Tidak wajib saat menyetujui**, dan itu bukan kelonggaran: menyetujui berarti
 * justifikasi AI sudah memadai — dan justifikasi itu sudah ada di layar.
 * Menuntut kalimat untuk menyatakan setuju hanya akan menghasilkan tujuh puluh
 * delapan "sudah sesuai" yang tidak menerangkan apa pun.
 */
export const catatanKoreksiSchema = z
	.string()
	.trim()
	.min(1, 'Alasan koreksi wajib diisi')
	.max(1000, 'Alasan maksimal 1000 karakter');

export const catatanTinjauSchema = z
	.string()
	.trim()
	.max(1000, 'Alasan maksimal 1000 karakter');

export const assessmentVerdictSchema = z.object({
	id: z.string(),
	dokumenId: z.string(),
	indikatorNo: z.number().int().positive(),
	/** Skor yang berlaku menurut Penjamin Mutu, 0–4. */
	skorFinal: z.number().min(0, 'Skor tidak boleh negatif'),
	/** Wajib untuk koreksi, boleh kosong untuk persetujuan. */
	catatan: catatanTinjauSchema,
	/**
	 * Skor AI **saat peninjauan dilakukan**. Disimpan, bukan dibaca ulang dari
	 * sesi terakhir — inilah satu-satunya cara mengetahui bahwa penilaian ulang
	 * sudah menggeser dasar pertimbangannya.
	 *
	 * `null` bila indikatornya gagal dinilai AI saat itu.
	 */
	skorMesinSaatDitinjau: z.number().nullable(),
	/** Sesi yang jadi dasar, untuk ditunjukkan pada penanda basi. */
	sesiIdSaatDitinjau: z.string(),
	ditinjauOlehUserId: z.string(),
	/** Nama ikut disimpan dengan alasan yang sama seperti `catatanOlehNama`. */
	ditinjauOlehNama: z.string(),
	ditinjauPada: z.string(),
});

export type AssessmentVerdictEntity = z.infer<typeof assessmentVerdictSchema>;

/**
 * Status peninjauan satu indikator — **tiga, dan ketiganya soal pekerjaan**.
 *
 * Rancangan sebelumnya punya lima varian di layar: belum, disetujui, dikoreksi,
 * lalu dua varian "basi" di atas dua yang terakhir. Dua di antaranya dibuang
 * dengan alasan yang berbeda-beda:
 *
 * - **"Dikoreksi" bukan status pekerjaan.** Untuk Penjamin Mutu, menyetujui dan
 *   mengoreksi sama-sama berarti "sudah saya tangani" — yang membedakan cuma
 *   angkanya, dan yang berlaku memang sudah tertera sebagai skor barisnya. Ia
 *   tetap dihitung sebagai fakta ({@link mengubahSkor}) untuk kartu ringkasan dan
 *   penyaring, sementara rinciannya (skor AI, catatan, atribusi) dibaca di
 *   laci detail.
 * - **"Disetujui · basi" adalah kontradiksi.** Disetujui atau tidak? Keadaan itu
 *   sebenarnya pekerjaan yang belum selesai, jadi ia diberi nama yang menyatakan
 *   itu: `TINJAU_ULANG`.
 *
 * `BELUM` dan `TINJAU_ULANG` bukan nilai yang tersimpan — keduanya diturunkan
 * dari ada-tidaknya baris keputusan dan dari perbandingan snapshot skor AI.
 */
export const statusTinjauEnum = z.enum(['BELUM', 'DISETUJUI', 'TINJAU_ULANG']);
export type StatusTinjau = z.infer<typeof statusTinjauEnum>;

export const statusTinjauLabels: Record<StatusTinjau, string> = {
	BELUM: 'Belum ditinjau',
	DISETUJUI: 'Disetujui',
	TINJAU_ULANG: 'Perlu ditinjau ulang',
};

/**
 * Apakah Penjamin Mutu mengubah angkanya, bukan sekadar menyetujui.
 *
 * **Diturunkan, tidak disimpan** — aturan yang sudah ditegakkan proyek ini
 * berkali-kali (status bab, skor maksimal, total skor): kolom yang bisa dihitung
 * dari fakta yang ada akan jadi kebenaran kedua yang bisa menyimpang. Di sini
 * menyimpangnya berarti sebuah baris mengaku dikoreksi padahal angkanya sama
 * persis dengan hitungan AI.
 *
 * Konsekuensi yang menyenangkan dari menurunkannya: saat Penjamin Mutu menggeser
 * skor **kembali** ke angka AI, keputusannya otomatis berhenti terhitung
 * sebagai koreksi tanpa perlu aksi terpisah. Itu memang yang ia maksud — "saya
 * cabut koreksi saya, AI-nya benar" — dan ia tidak perlu tahu ada dua konsep.
 *
 * Indikator yang gagal dinilai AI (`skorMesinSaatDitinjau = null`) selalu
 * terhitung diubah: memberi angka pada yang tidak punya angka memang bukan
 * menyetujui.
 */
export function mengubahSkor(verdict: AssessmentVerdictEntity): boolean {
	return verdict.skorFinal !== verdict.skorMesinSaatDitinjau;
}

/**
 * Status peninjauan sebuah indikator, diturunkan dari keputusannya.
 *
 * **Kenapa dasar yang bergeser membatalkan status "sudah ditinjau".** Tanpa itu,
 * penilaian ulang jadi mesin pencuci persetujuan lama: seseorang menyetujui skor
 * 3, babnya disunting, penilaian dijalankan ulang dan AI memberi 2 — dan
 * dokumen tetap memajang "Disetujui · 3" seolah ada manusia yang memeriksanya,
 * padahal yang ia periksa sudah bukan angka ini.
 *
 * **Ditandai, bukan dibuang.** Keputusannya sendiri tetap tersimpan utuh beserta
 * catatan dan atribusinya — yang berubah hanya statusnya, dan menyimpannya
 * kembali akan menegaskannya ulang terhadap hasil terbaru. Konsep yang sama
 * dengan `ragasBasi()` di fitur chapter, dan alasannya juga sama: yang dihapus
 * akan menghilangkan fakta yang benar.
 *
 * **Skor yang berlaku tetap angka Penjamin Mutu**, bukan angka AI terbaru
 * (lihat `gabungPenilaian`). Keputusan manusia tidak dicabut diam-diam oleh
 * penilaian ulang; ia cuma diminta ditinjau lagi.
 */
export function statusTinjauDari(
	verdict: AssessmentVerdictEntity | undefined,
	skorMesinSekarang: number | null,
): StatusTinjau {
	if (!verdict) return 'BELUM';
	return verdict.skorMesinSaatDitinjau === skorMesinSekarang
		? 'DISETUJUI'
		: 'TINJAU_ULANG';
}
