import { z } from 'zod';

/**
 * Mutu kerja penilai AI untuk satu sesi AMI (`apps/ai/eval/ragas_eval.py`,
 * endpoint `POST /eval/run`).
 *
 * **Bukan penilaian akreditasi, dan bukan pula mutu generasi bab.** Tiga hal
 * bernama RAGAS hidup berdampingan di repo ini dan mudah tertukar:
 *
 * | | Mengukur | Rumahnya |
 * | --- | --- | --- |
 * | `RagasScore` (chapter) | Mutu jawaban AI saat **menulis** bab | tab Kualitas AI di editor |
 * | Entitas ini | Mutu retrieval & justifikasi saat **menilai** dokumen | tab Kualitas Penilaian |
 * | Benchmark | Skor agen vs skor referensi manusia | CLI, `run_benchmark.py` |
 *
 * **`EvalResult` di Prisma tidak bisa dipakai untuk ini**: kolomnya `@unique`
 * pada `generationRunId`, jadi ia milik baris pertama tabel di atas. Metrik untuk
 * `AssessmentSession` butuh tabelnya sendiri — celah itu dicatat di
 * docs/database.md, bukan dipaksakan masuk ke tabel yang bentuknya tidak cocok.
 */
export const amiRagasMetrikEnum = z.enum([
	'faithfulness',
	'answer_relevancy',
	'context_precision',
	'context_recall',
]);

export type AmiRagasMetrik = z.infer<typeof amiRagasMetrikEnum>;

export const assessmentQualitySchema = z.object({
	metrik: z.array(
		z.object({
			metrik: amiRagasMetrikEnum,
			/** 0–1, sesuai rentang bawaan Ragas. */
			nilai: z.number().min(0).max(1),
			/** `reason` dari penilai: kenapa angkanya segitu untuk sesi ini. */
			alasan: z.string(),
		}),
	),
	/**
	 * Rincian per indikator, dipakai menjawab "indikator mana yang angkanya patut
	 * dicurigai". Tanpa ini, agregat sesi hanya bisa dibaca sebagai vonis atas
	 * seluruh penilaian — benar, tapi tidak bisa ditindaklanjuti.
	 */
	perIndikator: z.array(
		z.object({
			indikatorNo: z.number().int().positive(),
			contextRecall: z.number().min(0).max(1),
			faithfulness: z.number().min(0).max(1),
		}),
	),
	/** Berapa potongan konteks yang ikut dinilai seluruh sesi. */
	jumlahChunk: z.number().int().nonnegative(),
	/** Model penilai (`RAGAS_OPENROUTER_MODEL`), bukan model yang dievaluasi. */
	judgeModel: z.string(),
	dihitungPada: z.string(),
});

export type AssessmentQuality = z.infer<typeof assessmentQualitySchema>;

/**
 * Nama dan penjelasan tiap metrik, sejajar `RAGAS_METRIK_INFO` di fitur chapter.
 *
 * Kalimat "apa yang diukur" bukan hiasan: tanpa itu, "Faithfulness 0,82" tidak
 * berarti apa pun bagi siapa pun di luar tim RAG.
 *
 * **Empat metrik, bukan tiga.** `ragas-score.entity.ts` sengaja membuang
 * `context_recall` untuk generasi, alasannya metrik itu menuntut jawaban acuan
 * sementara LED justru dokumen yang sedang ditulis dan tidak punya versi "yang
 * benar" untuk dibandingkan. **Untuk penilaian, acuannya ada**: bunyi indikator
 * beserta level skor 0–4 di matriks sudah menyatakan apa yang seharusnya dicari,
 * dan `ragas_eval.py` memang menjalankan keempatnya. Pengecualian di sana tidak
 * berlaku di sini, dan itu perlu ditulis — bukan dibalik diam-diam.
 *
 * Justru metrik keempat itulah yang membuat tab ini pantas dilihat pengguna
 * biasa, bukan cuma pengembang: ia satu-satunya yang bisa membedakan "dokumen
 * saya memang kurang" dari "AI-nya tidak menemukan tulisan saya".
 */
export const AMI_RAGAS_METRIK_INFO: Record<
	AmiRagasMetrik,
	{ label: string; diukur: string }
> = {
	faithfulness: {
		label: 'Kesetiaan pada sumber',
		diukur:
			'Seberapa banyak pernyataan di justifikasi penilai yang benar-benar bisa ditelusuri ke potongan LED dan LKPS yang diambil. Nilai rendah berarti penilai mengarang alasan yang tidak ada di sumbernya, sehingga skornya tidak bisa dipertanggungjawabkan.',
	},
	answer_relevancy: {
		label: 'Relevansi justifikasi',
		diukur:
			'Seberapa nyambung alasan yang diberikan dengan indikator yang sedang dinilai. Nilai rendah berarti penilai menjawab hal lain — angkanya bisa saja benar, tapi alasannya tidak menjelaskannya.',
	},
	context_precision: {
		label: 'Ketepatan pencarian',
		diukur:
			'Seberapa besar bagian potongan dokumen yang diambil ternyata memang terpakai untuk menilai. Nilai rendah berarti pencarian membawa banyak bagian yang tidak relevan, sehingga penilai harus memilah lebih banyak sebelum sampai ke yang penting.',
	},
	context_recall: {
		label: 'Kelengkapan pencarian',
		diukur:
			'Seberapa lengkap bagian dokumen yang seharusnya dipakai berhasil ditemukan. Nilai rendah berarti ada tulisan yang relevan di LED tapi tidak terambil — skor indikatornya jadi rendah bukan karena dokumennya kurang, melainkan karena penilai AI tidak menemukannya. Periksa indikator ini secara manual sebelum menerima angkanya.',
	},
};

/** Urutan tampil; dari yang paling menentukan kepercayaan pada hasilnya. */
export const AMI_RAGAS_URUTAN: AmiRagasMetrik[] = [
	'context_recall',
	'faithfulness',
	'answer_relevancy',
	'context_precision',
];

/**
 * Ambang di bawah mana sebuah indikator layak diperiksa manusia.
 *
 * Satu angka, dipakai bersama daftar "patut diperiksa" dan kalimat ringkasannya,
 * supaya keduanya tidak bisa berbeda pendapat soal apa yang dianggap rendah.
 */
export const RECALL_PERLU_DIPERIKSA = 0.6;

export type IndikatorRecallRendah = {
	indikatorNo: number;
	contextRecall: number;
	faithfulness: number;
};

/**
 * Indikator yang pencariannya paling tidak lengkap, terendah di atas.
 *
 * Diurutkan menaik, bukan disaring lalu diurutkan menurun: gunanya daftar ini
 * menunjukkan **apa yang harus diperiksa lebih dulu**, jadi yang paling
 * meragukan harus jadi baris pertama yang terbaca.
 */
export function pickRecallRendah(
	kualitas: AssessmentQuality,
	batas: number = RECALL_PERLU_DIPERIKSA,
): IndikatorRecallRendah[] {
	return kualitas.perIndikator
		.filter((baris) => baris.contextRecall < batas)
		.sort((a, b) => a.contextRecall - b.contextRecall);
}
