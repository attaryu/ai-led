import { z } from 'zod';

import {
	skorMaksimal,
	type RubricCriterion,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { assessmentQualitySchema } from './assessment-quality.entity';
import {
	mengubahSkor,
	statusTinjauDari,
	type AssessmentVerdictEntity,
	type StatusTinjau,
} from './assessment-verdict.entity';
import { assessmentSourceSchema } from './assessment-source.entity';
import {
	SKOR_PERLU_DIPERIKSA,
	tingkatConfidence,
	type IndicatorResultEntity,
} from './indicator-result.entity';

/**
 * Satu kali penjalanan Penilaian AMI atas sebuah Dokumen LED
 * (docs/database.md → `AssessmentSession`).
 *
 * **Satu sesi per dokumen, bukan per prodi maupun per bab.** Itu bukan pilihan
 * tampilan melainkan bentuk datanya: `AssessmentSession.dokumenId` adalah
 * foreign key ke `DokumenLed`. Karena itu permukaannya hidup di Lapis 3
 * (Dashboard Dokumen LED), bukan di Dashboard Prodi maupun di dalam Editor Bab.
 */
export const assessmentStatusEnum = z.enum(['RUNNING', 'COMPLETED', 'FAILED']);
export type AssessmentStatus = z.infer<typeof assessmentStatusEnum>;

export const assessmentStatusLabels: Record<AssessmentStatus, string> = {
	RUNNING: 'Berjalan',
	COMPLETED: 'Selesai',
	FAILED: 'Gagal',
};

export const assessmentSessionSchema = z.object({
	id: z.string(),
	/** `DokumenLed.id`. Dinamai `dokumenId` mengikuti kolom Prisma-nya. */
	dokumenId: z.string(),
	sumber: assessmentSourceSchema,
	totalIndicators: z.number().int().nonnegative(),
	completedIndicators: z.number().int().nonnegative(),
	status: assessmentStatusEnum,
	error: z.string().nullable(),
	dijalankanOlehUserId: z.string(),
	/** Nama ikut disimpan dengan alasan yang sama seperti `dijalankanOlehNama` skor bab. */
	dijalankanOlehNama: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	/**
	 * Metrik RAGAS atas sesi ini. `null` berarti belum dievaluasi — keadaan yang
	 * sah, dan satu-satunya keadaan yang memunculkan tombol "Jalankan evaluasi".
	 *
	 * `.default(null)` seperti `ChapterEntity.ragas`, supaya sesi yang tersimpan
	 * sebelum kolom ini ada tetap lolos validasi `findAll` alih-alih dianggap
	 * rusak lalu menghapus pekerjaan lokal penggunanya.
	 */
	kualitas: assessmentQualitySchema.nullable().default(null),
});

export type AssessmentSessionEntity = z.infer<typeof assessmentSessionSchema>;

/** 0–100, dibulatkan. 0 bila sesi belum punya indikator sama sekali. */
export function persenProgres(sesi: AssessmentSessionEntity): number {
	if (sesi.totalIndicators === 0) return 0;
	return Math.round((sesi.completedIndicators / sesi.totalIndicators) * 100);
}

/**
 * Satu baris penilaian final: hasil mesin, indikatornya, dan keputusan Penjamin
 * Mutu yang berlaku atasnya.
 *
 * `skorFinal` **diturunkan, tidak disimpan** — hasil mesin ditimpa keputusan.
 * Alasannya sama dengan yang sudah ditulis `ringkasSkor()` untuk skor bab: kolom
 * agregat yang bisa dihitung dari fakta yang ada akan jadi kebenaran kedua yang
 * bisa menyimpang, dan di sini menyimpangnya berarti dokumen resmi menyebut
 * angka yang tidak sama dengan yang dilihat orang di layar.
 *
 * **`statusTinjau` dan `perluDiperiksa` dua hal berbeda, dan penamaannya sengaja
 * dijauhkan.** Yang pertama fakta tentang pekerjaan manusia (sudah dilihat atau
 * belum); yang kedua dugaan mesin tentang angkanya (patut dicurigai atau tidak).
 * Versi pertama berkas ini menamai keduanya "perlu ditinjau" dan keduanya jadi
 * tidak bisa dibedakan di layar.
 *
 * Keduanya tetap tidak sepenuhnya lepas: persetujuan manusia **mematikan** dugaan
 * mesin, karena yang menyetujui sudah membaca angka beserta alasannya. Lihat
 * {@link PenilaianFinalRow.perluDiperiksa}.
 */
export type PenilaianFinalRow = {
	kriteria: RubricCriterion;
	/** `undefined` bila indikator ini tidak ikut dinilai di sesi tersebut. */
	hasil: IndicatorResultEntity | undefined;
	/** `undefined` bila belum pernah ditinjau. */
	keputusan: AssessmentVerdictEntity | undefined;
	statusTinjau: StatusTinjau;
	/** Penjamin Mutu mengubah angkanya, bukan sekadar menyetujui hitungan mesin. */
	mengubahSkor: boolean;
	/**
	 * Yang berlaku: skor keputusan bila ada, selain itu skor mesin.
	 *
	 * **Tetap angka Penjamin Mutu walau statusnya `TINJAU_ULANG`.** Keputusan
	 * manusia tidak dicabut diam-diam oleh penilaian ulang — kalau ia berbalik ke
	 * angka mesin sendiri, rata-rata dokumen akan bergeser tanpa ada seorang pun
	 * yang memutuskan apa pun.
	 */
	skorFinal: number | null;
	/** Skor mentah dari mesin, tetap ditampilkan berdampingan saat berbeda. */
	skorMesin: number | null;
	skorMaksimal: number;
	/**
	 * Angkanya patut diperiksa manusia, **dan belum ada yang menyetujuinya**.
	 *
	 * Tiga sebab temuannya digabung dengan **atau**, bukan dan: masing-masing sudah
	 * cukup jadi alasan untuk melihat lebih dekat, dan menuntut ketiganya sekaligus
	 * akan menyembunyikan hampir semuanya.
	 *
	 * **Syarat "belum disetujui" itu yang membuatnya berhenti berbunyi.** Begitu
	 * Penjamin Mutu menyetujui sebuah indikator, ia sudah melihat angkanya beserta
	 * alasan mesinnya dan menyatakan itu yang berlaku — saran mesin untuk memeriksa
	 * lagi tidak menambah apa pun, dan dua penanda yang bertentangan di satu baris
	 * ("Disetujui" bersama "Perlu diperiksa") justru membuat pembaca ragu mana yang
	 * harus dipercaya.
	 *
	 * Yang berstatus `TINJAU_ULANG` **tetap** ditandai: dasarnya sudah bergeser,
	 * jadi persetujuan lamanya belum menjawab angka yang berlaku sekarang.
	 */
	perluDiperiksa: boolean;
};

/**
 * Menggabungkan hasil mesin, keputusan, dan master indikator jadi tabel
 * penilaian final — terurut nomor indikator.
 *
 * Indikator yang tidak punya hasil tetap muncul dengan `skorFinal: null`, bukan
 * dibuang: matriks menentukan apa yang **seharusnya** dinilai, jadi indikator
 * yang bolong adalah temuan, bukan baris yang tidak ada.
 */
export function gabungPenilaian(input: {
	kriteria: RubricCriterion[];
	hasil: IndicatorResultEntity[];
	keputusan: AssessmentVerdictEntity[];
}): PenilaianFinalRow[] {
	const hasilPerNo = new Map(
		input.hasil.map((baris) => [baris.indikatorNo, baris]),
	);
	const keputusanPerNo = new Map(
		input.keputusan.map((baris) => [baris.indikatorNo, baris]),
	);

	return [...input.kriteria]
		.sort((a, b) => a.no - b.no)
		.map((kriteria) => {
			const hasil = hasilPerNo.get(kriteria.no);
			const keputusan = keputusanPerNo.get(kriteria.no);
			const skorMesin = hasil?.skor ?? null;
			const skorFinal = keputusan ? keputusan.skorFinal : skorMesin;

			const statusTinjau = statusTinjauDari(keputusan, skorMesin);

			const confidenceRendah =
				hasil?.confidence != null &&
				tingkatConfidence(hasil.confidence) === 'RENDAH';
			const skorRendah = skorFinal !== null && skorFinal <= SKOR_PERLU_DIPERIKSA;
			const gagal = hasil === undefined || hasil.error !== null;
			const adaTemuan = confidenceRendah || skorRendah || gagal;

			return {
				kriteria,
				hasil,
				keputusan,
				statusTinjau,
				mengubahSkor: keputusan ? mengubahSkor(keputusan) : false,
				skorFinal,
				skorMesin,
				skorMaksimal: skorMaksimal(kriteria),
				perluDiperiksa: adaTemuan && statusTinjau !== 'DISETUJUI',
			};
		});
}

export type RingkasanPenilaian = {
	/** Indikator yang punya skor final (mesin atau keputusan). */
	jumlahDinilai: number;
	total: number;
	/** Rata-rata skor final, dua desimal. 0 bila belum ada yang dinilai. */
	rataRata: number;
	/**
	 * Rata-rata terhadap skala maksimalnya, 0–100. Dipisah dari `rataRata` karena
	 * "2,23" tidak memberi tahu apa pun tanpa mengetahui skalanya.
	 */
	persen: number;
	/**
	 * Selesai ditinjau terhadap hasil yang berlaku sekarang.
	 *
	 * **Yang berstatus `TINJAU_ULANG` tidak ikut**, dan itu inti kejujuran angka
	 * ini: keputusan yang dasarnya sudah bergeser bukan pekerjaan yang selesai,
	 * dan menghitungnya sebagai selesai membuat progres mengaku lebih jauh
	 * daripada yang sebenarnya.
	 */
	jumlahDitinjau: number;
	jumlahBelumDitinjau: number;
	jumlahTinjauUlang: number;
	/**
	 * Berapa yang angkanya benar-benar diubah manusia.
	 *
	 * **Lintas status**, termasuk yang berstatus `TINJAU_ULANG` — koreksinya tetap
	 * ada, yang bergeser cuma dasarnya. Karena itu ia tidak bisa dikurangkan dari
	 * {@link jumlahDitinjau} untuk mendapat "yang disetujui apa adanya"; angka itu
	 * dihitung sendiri di bawah.
	 */
	jumlahDikoreksi: number;
	/** Ditinjau **dan** angkanya dibiarkan sama dengan hitungan mesin. */
	jumlahDisetujuiApaAdanya: number;
	/** 0–100, dibulatkan. Penyebutnya seluruh indikator. */
	persenDitinjau: number;
	jumlahPerluDiperiksa: number;
};

/**
 * Penyebut rata-rata adalah indikator yang **sudah punya skor**, bukan seluruh
 * indikator matriks.
 *
 * Bedanya terasa saat matriks bertambah setelah penilaian terakhir dijalankan:
 * memakai seluruh indikator akan membuat rata-ratanya ikut turun sendiri padahal
 * dokumennya tidak berubah — angka yang bergerak tanpa ada yang menggerakkannya.
 * Aturan ini sengaja sama dengan `ringkasSkor()` di fitur chapter.
 */
export function ringkasPenilaian(
	baris: PenilaianFinalRow[],
): RingkasanPenilaian {
	let jumlahDinilai = 0;
	let totalSkor = 0;
	let totalMaksimal = 0;
	let jumlahDitinjau = 0;
	let jumlahBelumDitinjau = 0;
	let jumlahTinjauUlang = 0;
	let jumlahDikoreksi = 0;
	let jumlahDisetujuiApaAdanya = 0;
	let jumlahPerluDiperiksa = 0;

	for (const row of baris) {
		if (row.skorFinal !== null) {
			jumlahDinilai += 1;
			totalSkor += row.skorFinal;
			totalMaksimal += row.skorMaksimal;
		}

		switch (row.statusTinjau) {
			case 'DISETUJUI':
				jumlahDitinjau += 1;
				if (!row.mengubahSkor) jumlahDisetujuiApaAdanya += 1;
				break;
			case 'TINJAU_ULANG':
				jumlahTinjauUlang += 1;
				break;
			default:
				jumlahBelumDitinjau += 1;
		}

		if (row.mengubahSkor) jumlahDikoreksi += 1;
		if (row.perluDiperiksa) jumlahPerluDiperiksa += 1;
	}

	const total = baris.length;

	return {
		jumlahDinilai,
		total,
		rataRata:
			jumlahDinilai === 0
				? 0
				: Math.round((totalSkor / jumlahDinilai) * 100) / 100,
		persen:
			totalMaksimal === 0 ? 0 : Math.round((totalSkor / totalMaksimal) * 100),
		jumlahDitinjau,
		jumlahBelumDitinjau,
		jumlahTinjauUlang,
		jumlahDikoreksi,
		jumlahDisetujuiApaAdanya,
		persenDitinjau: total === 0 ? 0 : Math.round((jumlahDitinjau / total) * 100),
		jumlahPerluDiperiksa,
	};
}
