import {
	delay,
	sidikJari,
} from '~/features/chapter/data/sources/remote/chapter-scoring.mock';
import {
	type AmiRagasMetrik,
	type AssessmentQuality,
} from '../../../domain/entities/assessment-quality.entity';

/**
 * Tiruan `POST /eval/run` di `apps/ai` — RAGAS atas satu sesi penilaian.
 *
 * Titik ganti tunggal untuk tab Kualitas Penilaian, sejajar
 * `assessment-run.mock.ts`. Yang asli (`apps/ai/eval/ragas_eval.py`) memakai
 * judge LLM terpisah dari model yang menilai, sesuai `RAGAS_PROVIDER` —
 * pemisahan itu ikut ditiru di sini sebatas namanya, supaya kolom "dinilai oleh"
 * di layar tidak pernah menyebut model yang sedang dievaluasi.
 */

export const EVAL_DELAY_MS = 1800;

/** Sejajar `RAGAS_OPENROUTER_MODEL` di `apps/ai/.env`. */
const JUDGE_MODEL = 'anthropic/claude-haiku-4.5';

export type RunEvalInput = {
	sesiId: string;
	/** Nomor indikator yang ikut dinilai di sesi itu. */
	indikatorNos: number[];
	/** Isi yang dinilai, ikut jadi sidik jari supaya angkanya deterministik. */
	konten: string;
};

/**
 * Angka 0–1 deterministik dalam rentang tertentu.
 *
 * Rentangnya berbeda per metrik dan itu disengaja: kelengkapan pencarian
 * dibiarkan paling lebar ke bawah supaya keadaan "ada tulisan yang tidak
 * ditemukan penilai AI" benar-benar muncul di data contoh. Kalau semuanya
 * dibangkitkan tinggi, daftar "patut diperiksa" akan selalu kosong dan bagian
 * paling berguna dari tab ini tidak akan pernah terlihat.
 */
function nilaiDeterministik(kunci: string, min: number, max: number): number {
	const rentang = Math.round((max - min) * 1000);
	const nilai = min + (sidikJari(kunci) % (rentang + 1)) / 1000;
	return Math.round(nilai * 100) / 100;
}

const RENTANG: Record<AmiRagasMetrik, [number, number]> = {
	faithfulness: [0.62, 0.95],
	answer_relevancy: [0.7, 0.96],
	context_precision: [0.55, 0.9],
	context_recall: [0.35, 0.93],
};

function alasanUntuk(metrik: AmiRagasMetrik, nilai: number): string {
	const persen = Math.round(nilai * 100);

	switch (metrik) {
		case 'faithfulness':
			return nilai >= 0.85
				? `${persen}% pernyataan di justifikasi bisa ditelusuri langsung ke potongan yang diambil.`
				: `${persen}% pernyataan bisa ditelusuri ke sumbernya; sisanya kesimpulan penilai yang tidak punya kalimat pendukung di dokumen.`;
		case 'answer_relevancy':
			return nilai >= 0.85
				? `Justifikasi menjawab bunyi indikatornya secara langsung di hampir semua baris.`
				: `Sebagian justifikasi membahas hal yang bersinggungan tapi bukan yang ditanyakan indikatornya.`;
		case 'context_precision':
			return nilai >= 0.8
				? `Sebagian besar potongan yang diambil memang terpakai untuk menilai.`
				: `Hanya ${persen}% potongan yang diambil terpakai — pencarian membawa banyak bagian yang tidak relevan.`;
		case 'context_recall':
			return nilai >= 0.8
				? `Hampir seluruh bagian dokumen yang relevan berhasil ditemukan.`
				: `Sekitar ${100 - persen}% bagian yang seharusnya dipakai tidak terambil. Skor pada indikator yang terdampak bisa lebih rendah dari yang seharusnya.`;
	}
}

export async function runAssessmentEval(
	input: RunEvalInput,
): Promise<Omit<AssessmentQuality, 'dihitungPada'>> {
	await delay(EVAL_DELAY_MS);

	const perIndikator = input.indikatorNos.map((indikatorNo) => ({
		indikatorNo,
		contextRecall: nilaiDeterministik(
			`recall:${indikatorNo}:${input.konten}`,
			...RENTANG.context_recall,
		),
		faithfulness: nilaiDeterministik(
			`faith:${indikatorNo}:${input.konten}`,
			...RENTANG.faithfulness,
		),
	}));

	/**
	 * Agregat dua metrik yang punya rincian per indikator dihitung sebagai
	 * rata-rata rinciannya, bukan dibangkitkan sendiri. Kalau keduanya lahir
	 * terpisah, angka besar di atas bisa berkata "aman" sementara daftar di
	 * bawahnya penuh baris merah — dan tidak ada cara memberi tahu pembaca mana
	 * yang benar.
	 */
	function rataRata(ambil: (b: (typeof perIndikator)[number]) => number): number {
		if (perIndikator.length === 0) return 0;
		const total = perIndikator.reduce((sum, baris) => sum + ambil(baris), 0);
		return Math.round((total / perIndikator.length) * 100) / 100;
	}

	const nilaiPerMetrik: Record<AmiRagasMetrik, number> = {
		context_recall: rataRata((b) => b.contextRecall),
		faithfulness: rataRata((b) => b.faithfulness),
		answer_relevancy: nilaiDeterministik(
			`relevancy:${input.sesiId}`,
			...RENTANG.answer_relevancy,
		),
		context_precision: nilaiDeterministik(
			`precision:${input.sesiId}`,
			...RENTANG.context_precision,
		),
	};

	return {
		metrik: (
			Object.keys(nilaiPerMetrik) as AmiRagasMetrik[]
		).map((metrik) => ({
			metrik,
			nilai: nilaiPerMetrik[metrik],
			alasan: alasanUntuk(metrik, nilaiPerMetrik[metrik]),
		})),
		perIndikator,
		// Empat potongan per indikator, angka bulat yang cukup masuk akal untuk
		// ditampilkan sebagai keterangan "berapa yang ikut dinilai".
		jumlahChunk: input.indikatorNos.length * 4,
		judgeModel: JUDGE_MODEL,
	};
}
