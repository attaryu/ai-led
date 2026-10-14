import { z } from 'zod';

/**
 * Dari mana Penilaian AMI mengambil bahannya (`AssessmentSession` di
 * docs/database.md, plus dua kolom yang belum ada di sana — lihat catatan celah
 * di bawah).
 *
 * Prototipe AMI berdiri sendiri sehingga keempat bahannya harus diunggah:
 * matriks penilaian, dokumen LED, data LKPS, dan Laporan AK. Di produk, tiga di
 * antaranya sudah punya rumah dan mengunggahnya lagi berarti membuat salinan
 * kedua yang bisa berbeda dari aslinya:
 *
 * | Bahan | Rumahnya | Diunggah di sini? |
 * | --- | --- | --- |
 * | Matriks penilaian | `RUBRIK_KRITERIA`, master global tanpa `tenantId` | tidak pernah |
 * | Dokumen LED | `kontenKerja` tiap bab, ditulis di Editor Bab | hanya untuk dokumen warisan |
 * | Data LKPS | `BuktiDukung` milik prodi | lewat pustaka |
 * | Laporan AK | `AssessmentSession.laporanBuktiDukungId` | lewat pustaka |
 *
 * **Celah skema yang dicatat, bukan ditambal diam-diam.** `AssessmentSession` di
 * Prisma baru punya `laporanBuktiDukungId`; `sumberLed`, `ledFileName`, dan
 * `lkpsBuktiDukungId` belum ada kolomnya. Dicatat di docs/database.md mengikuti
 * kebiasaan yang sudah dipakai `RubricCriterion.levelSkor` dan `RagasScore`
 * generasi — tahap ini tidak menyentuh Prisma.
 */
export const ledSourceModeEnum = z.enum(['EDITOR', 'UNGGAHAN']);
export type LedSourceMode = z.infer<typeof ledSourceModeEnum>;

export const assessmentSourceSchema = z.object({
	sumberLed: ledSourceModeEnum,
	/**
	 * Nama berkas PDF LED yang diunggah; terisi hanya bila `sumberLed =
	 * 'UNGGAHAN'`.
	 *
	 * PDF LED **bukan** bukti dukung, jadi ia menempel langsung ke sesi alih-alih
	 * masuk pustaka: bukti dukung adalah bahan yang dirujuk dokumen, sedangkan ini
	 * dokumennya sendiri. Menaruhnya di pustaka akan membuatnya muncul sebagai
	 * kandidat rujukan bagi bab-bab di dokumen yang sama.
	 */
	ledFileName: z.string().nullable(),
	/** `BuktiDukung` berisi data LKPS prodi; `null` berarti belum dipilih. */
	lkpsBuktiDukungId: z.string().nullable(),
	/**
	 * `BuktiDukung` berisi Laporan AK. Opsional menurut prototipe — gunanya
	 * menyaring subset indikator yang dinilai. `null` berarti seluruh indikator di
	 * matriks ikut dinilai.
	 */
	laporanBuktiDukungId: z.string().nullable(),
});

export type AssessmentSource = z.infer<typeof assessmentSourceSchema>;

/** Sumber untuk dokumen yang belum pernah dinilai: ambil dari editor, sisanya kosong. */
export const SUMBER_AWAL: AssessmentSource = {
	sumberLed: 'EDITOR',
	ledFileName: null,
	lkpsBuktiDukungId: null,
	laporanBuktiDukungId: null,
};

/**
 * Status satu prasyarat. `OPSIONAL` sengaja dibedakan dari `KURANG`: keduanya
 * sama-sama belum terisi, tapi hanya satu yang menahan tombol jalankan, dan
 * menampilkan keduanya dengan rupa yang sama akan membuat pengguna mencari-cari
 * berkas yang sebenarnya tidak dibutuhkan.
 */
export const readinessStateEnum = z.enum(['SIAP', 'KURANG', 'OPSIONAL']);
export type ReadinessState = z.infer<typeof readinessStateEnum>;

export type ReadinessItem = {
	kunci: 'matriks' | 'led' | 'lkps' | 'laporan';
	label: string;
	state: ReadinessState;
	/** Apa yang sedang dipakai, atau apa yang kurang. */
	keterangan: string;
	/** Ke mana pengguna pergi untuk melengkapinya; `null` bila tidak ada. */
	tautan: { label: string; to: string } | null;
};

export type AssessmentReadiness = {
	items: ReadinessItem[];
	/** Semua prasyarat wajib terpenuhi. */
	siap: boolean;
	/** Jumlah prasyarat wajib yang belum terpenuhi, untuk ringkasan satu baris. */
	jumlahKurang: number;
};

/**
 * Menghitung kesiapan menjalankan penilaian.
 *
 * **Menggantikan langkah 1 wizard prototipe.** Setelah keempat unggahan runtuh
 * jadi pemilihan, tidak ada lagi yang perlu dikerjakan berurutan — dan wizard
 * hanya benar sekali, sedangkan dokumen ini akan dinilai berulang kali. Yang
 * dibutuhkan bentuk yang sama-sama masuk akal untuk penilaian pertama maupun
 * kesepuluh: daftar prasyarat yang mengembang saat ada yang kurang dan mengempis
 * jadi satu baris saat siap.
 *
 * Matriks selalu `SIAP` karena ia master yang di-seed — ia tetap didaftar, bukan
 * disembunyikan, supaya pertanyaan "dinilai pakai rubrik apa?" punya jawaban yang
 * terlihat tanpa harus membuka tab lain.
 */
export function hitungKesiapan(input: {
	sumber: AssessmentSource;
	jumlahIndikator: number;
	/** Jumlah bab yang sudah punya tulisan sungguhan. */
	babTerisi: number;
	totalBab: number;
	/** Nama berkas LKPS terpilih; `null` bila id-nya menunjuk berkas yang hilang. */
	namaLkps: string | null;
	/** Status ekstraksi LKPS terpilih; hanya `SIAP` yang bisa dibaca penilai. */
	statusLkps: string | null;
	namaLaporan: string | null;
	/** Untuk tautan "lengkapi di sini". */
	projectId: string;
	studyProgramId: string;
}): AssessmentReadiness {
	const { sumber } = input;

	const matriks: ReadinessItem = {
		kunci: 'matriks',
		label: 'Matriks penilaian',
		state: input.jumlahIndikator > 0 ? 'SIAP' : 'KURANG',
		keterangan:
			input.jumlahIndikator > 0
				? `${input.jumlahIndikator} indikator dari master rubrik LAM Teknik`
				: 'Instrumen Akreditasi dokumen ini belum punya indikator.',
		tautan: null,
	};

	const led: ReadinessItem =
		sumber.sumberLed === 'EDITOR'
			? input.babTerisi > 0
				? {
						kunci: 'led',
						label: 'Dokumen LED',
						state: 'SIAP',
						keterangan: `${input.babTerisi} dari ${input.totalBab} bab sudah ada isinya`,
						tautan: { label: 'Buka editor', to: `/editor/${input.projectId}` },
					}
				: {
						kunci: 'led',
						label: 'Dokumen LED',
						state: 'KURANG',
						keterangan:
							'Belum satu pun bab punya tulisan. Tulis di editor, atau unggah PDF LED bila dokumennya disusun di luar aplikasi.',
						tautan: { label: 'Buka editor', to: `/editor/${input.projectId}` },
					}
			: sumber.ledFileName
				? {
						kunci: 'led',
						label: 'Dokumen LED',
						state: 'SIAP',
						keterangan: `Dari unggahan: ${sumber.ledFileName}`,
						tautan: null,
					}
				: {
						kunci: 'led',
						label: 'Dokumen LED',
						state: 'KURANG',
						keterangan: 'Berkas PDF LED belum diunggah.',
						tautan: null,
					};

	const pustaka = {
		label: 'Buka pustaka',
		to: `/study-programs/${input.studyProgramId}/evidence`,
	};

	const lkps: ReadinessItem = input.namaLkps
		? {
				kunci: 'lkps',
				label: 'Data LKPS',
				state: input.statusLkps === 'SIAP' ? 'SIAP' : 'KURANG',
				keterangan:
					input.statusLkps === 'SIAP'
						? input.namaLkps
						: `${input.namaLkps} — ${input.statusLkps === 'GAGAL' ? 'gagal dibaca, unggah ulang' : 'masih diproses'}.`,
				tautan: pustaka,
			}
		: {
				kunci: 'lkps',
				label: 'Data LKPS',
				state: 'KURANG',
				keterangan: sumber.lkpsBuktiDukungId
					? 'Berkas yang dipilih sudah tidak ada di pustaka bukti dukung.'
					: 'Belum dipilih. Indikator kuantitatif tidak bisa dinilai tanpa data ini.',
				tautan: pustaka,
			};

	const laporan: ReadinessItem = input.namaLaporan
		? {
				kunci: 'laporan',
				label: 'Laporan AK',
				state: 'SIAP',
				keterangan: input.namaLaporan,
				tautan: pustaka,
			}
		: {
				kunci: 'laporan',
				label: 'Laporan AK',
				state: 'OPSIONAL',
				keterangan: 'Tidak dipilih — seluruh indikator matriks akan dinilai.',
				tautan: pustaka,
			};

	const items = [matriks, led, lkps, laporan];
	const jumlahKurang = items.filter((item) => item.state === 'KURANG').length;

	return { items, siap: jumlahKurang === 0, jumlahKurang };
}
