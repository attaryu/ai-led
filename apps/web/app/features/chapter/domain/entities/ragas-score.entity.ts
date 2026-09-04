import { z } from 'zod';

/**
 * Penilaian mutu jawaban AI untuk satu kali generate (docs/application_flow.md
 * §10, docs/architecture.md §5.4).
 *
 * **Bukan penilaian akreditasi.** Penilaian AMI menilai apakah isi bab layak
 * menurut kriteria LAM Teknik; yang ini menilai apakah AI-nya bekerja dengan
 * baik — seberapa setia hasilnya pada potongan sumber yang diambil, seberapa
 * nyambung ia dengan yang diminta, seberapa tepat sasaran potongan yang
 * di-retrieve. Dua hal yang bisa berlawanan: jawaban yang sangat setia pada
 * sumber tetap bisa dapat skor indikator rendah kalau sumbernya memang belum
 * memadai.
 *
 * **Tidak punya tabel di docs/database.md.** Lima belas tabel di sana, tidak satu
 * pun menyimpannya, padahal `architecture.md §5.2` langkah 5 menuliskan hasilnya
 * ditulis ke basis data bersama `konten_kerja` dan `BUKTI_DUKUNG_BAB`. Celah itu
 * dicatat di `database.md`, bukan ditambal diam-diam.
 *
 * **Dihitung LLM-as-judge, bukan library `ragas` langsung** (lihat
 * `worker.py::_judge_to_ragas_metrics`) — library aslinya butuh LLM patuh
 * ketat ke format JSON internalnya sendiri, yang gagal terlalu sering dengan
 * model lokal. `context_recall` karena itu bisa ikut ditampilkan (LLM judge
 * yang menilai coverage-nya sendiri, bukan dihitung dari `reference` yang LED
 * memang tidak punya).
 */
export const ragasMetrikEnum = z.enum([
	'faithfulness',
	'answer_relevancy',
	'context_precision',
	'context_recall',
]);

export type RagasMetrik = z.infer<typeof ragasMetrikEnum>;

export const ragasScoreSchema = z.object({
	metrik: z.array(
		z.object({
			metrik: ragasMetrikEnum,
			/** 0–1, sesuai rentang bawaan Ragas. */
			nilai: z.number().min(0).max(1),
			/** `reason` dari penilai: kenapa angkanya segitu untuk generate ini. */
			alasan: z.string(),
		}),
	),
	/** Berapa potongan konteks yang ikut dinilai. */
	jumlahChunk: z.number().int().nonnegative(),
	dihitungPada: z.string(),
});

export type RagasScore = z.infer<typeof ragasScoreSchema>;

/**
 * Nama dan penjelasan tiap metrik.
 *
 * Kalimat "apa yang diukur" bukan hiasan. Tanpa itu, "Faithfulness 0,82" tidak
 * berarti apa pun bagi siapa pun di luar tim RAG — angka telanjang yang hanya
 * tampak berwibawa tanpa menambah apa pun bagi pembacanya.
 */
export const RAGAS_METRIK_INFO: Record<
	RagasMetrik,
	{ label: string; diukur: string }
> = {
	faithfulness: {
		label: 'Kesetiaan pada sumber',
		diukur:
			'Seberapa banyak pernyataan di hasil generate yang benar-benar bisa ditelusuri ke bukti dukung dan panduan yang diambil. Nilai rendah berarti AI menambahkan hal yang tidak ada di sumbernya.',
	},
	answer_relevancy: {
		label: 'Relevansi jawaban',
		diukur:
			'Seberapa nyambung hasilnya dengan bab yang diminta beserta arahan tambahan penyusun. Nilai rendah berarti tulisannya melebar ke hal yang tidak ditanyakan.',
	},
	context_precision: {
		label: 'Ketepatan konteks',
		diukur:
			'Seberapa besar bagian potongan sumber yang diambil ternyata memang terpakai. Nilai rendah berarti retrieval membawa banyak potongan yang tidak relevan.',
	},
	context_recall: {
		label: 'Cakupan konteks',
		diukur:
			'Seberapa lengkap potongan sumber yang diambil menutupi fakta yang seharusnya dibahas bagian ini. Nilai rendah berarti ada fakta relevan yang tidak ter-retrieve.',
	},
};

/** Urutan tampil; dari yang paling menentukan kepercayaan pada hasilnya. */
export const RAGAS_URUTAN: RagasMetrik[] = [
	'faithfulness',
	'answer_relevancy',
	'context_precision',
	'context_recall',
];

/**
 * Skor menjelaskan tulisan **saat ia dinilai**. Kalau babnya disunting sesudah
 * itu, angkanya masih benar sebagai catatan generate yang pernah terjadi, tapi
 * berhenti menggambarkan isi bab yang sekarang.
 *
 * Ini kelas cacat yang sama dengan `checkpointAktifId` yang dulu tidak dibersihkan
 * generate: angka yang mengaku menjelaskan sesuatu yang sudah berubah. Karena itu
 * ditandai, bukan dihapus — yang dihapus akan menghilangkan fakta yang sah.
 */
export function ragasBasi(
	ragas: RagasScore | null,
	terakhirDisimpan: string | null,
): boolean {
	if (!ragas || !terakhirDisimpan) return false;
	return terakhirDisimpan > ragas.dihitungPada;
}
