/**
 * Tiruan sisi jaringan untuk generate konten bab dengan AI (RAG).
 *
 * Ini **satu-satunya berkas yang perlu diganti** saat backend siap, mengikuti
 * kebiasaan yang sudah dipakai `evidence-upload.mock.ts`. Bentuk masukannya
 * sudah disusun mengikuti alur sebenarnya (docs/architecture.md §"RAG Pipeline"):
 * bab yang dituju, bukti dukung terpilih sebagai konteks retrieval, dan arahan
 * tambahan dari penyusun. Yang tidak ditiru di sini adalah sifat asinkronnya —
 * alur sungguhan mengantre lewat Redis stream lalu di-poll, sedangkan ini
 * selesai dalam satu Promise.
 *
 * Kegagalan sengaja **tidak** disuntikkan berkala seperti unggahan bukti dukung:
 * generate adalah aksi paling mahal di produk ini dan satu-satunya jalan
 * memulihkannya adalah mengulang dari awal, jadi kegagalan buatan hanya akan
 * menghalangi pengembangan. Jalur error tetap ditangani pemanggil untuk saat
 * backend sungguhan masuk.
 */

import { type RagasScore } from '../../../domain/entities/ragas-score.entity';

/** Cukup lama untuk memperlihatkan keadaan memuat, cukup pendek untuk dites. */
export const GENERATE_DELAY_MS = 2800;

export type GenerateChapterInput = {
	judulBab: string;
	urutanBab: number;
	/** Bukti dukung terpilih; hanya yang berstatus `SIAP` yang sampai ke sini. */
	buktiDukung: { id: string; namaDokumen: string }[];
	/** Arahan bebas dari penyusun; string kosong bila tidak diisi. */
	prompt: string;
};

export type GenerateChapterResult = {
	/** HTML, sesuai format `kontenKerja` (lihat `chapter.entity.ts`). */
	html: string;
	/**
	 * Id chunk vector database yang jadi rujukan (`BAB_DRAFT.referensi_chunk_ids`).
	 *
	 * Ditiru, tapi bentuknya dijaga menyerupai yang sebenarnya: satu chunk panduan
	 * yang dicocokkan lewat nomor bab, plus satu chunk per bukti dukung yang
	 * dipakai. Inilah yang membuat jejak "versi ini dulu disusun dari apa" bisa
	 * dilacak sampai ke potongan sumbernya, bukan cuma sampai ke nama berkas.
	 */
	referensiChunkIds: string[];
	/**
	 * Mutu jawaban AI untuk generate ini (docs/architecture.md §5.4).
	 *
	 * Ikut di sini, bukan lewat panggilan tersendiri, karena docs menyatakannya
	 * dihitung **di dalam siklus job generate yang sama** — tidak ada pemicu manual
	 * dan tidak ada antrean terpisah untuknya.
	 *
	 * Tanpa `dihitungPada`: stempelnya dipasang `applyGenerate` supaya sama persis
	 * dengan `terakhirDisimpan`. Kalau keduanya berbeda walau beberapa milidetik,
	 * penanda "isi sudah berubah sejak dinilai" akan menyala palsu sejak detik
	 * pertama.
	 */
	ragas: Omit<RagasScore, 'dihitungPada'>;
};

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sidik jari isi, supaya nilainya deterministik — alasannya di `hitungRagas`. */
function sidikJari(teks: string): number {
	let nilai = 0;
	for (let i = 0; i < teks.length; i += 1) {
		nilai = (nilai * 31 + teks.charCodeAt(i)) >>> 0;
	}
	return nilai;
}

/**
 * Metrik RAGAS tiruan.
 *
 * **Deterministik**, sama seperti mesin skor indikator dan dengan alasan yang
 * sama: skor ini ikut disalin ke checkpoint yang isinya permanen, jadi nilai
 * acak akan membuat arsip yang sama dibaca berbeda tiap kali.
 *
 * `alasan` tiap metrik menyebut kondisi nyata generate ini — berapa potongan
 * sumber yang dipakai, apakah hasilnya mengutip nama berkas — **bukan** mengulang
 * definisi metriknya. Definisi hidup di `RAGAS_METRIK_INFO`, dan menuliskannya
 * dua kali membuat bagian "alasan" tidak menambah apa pun.
 */
function hitungRagas(
	html: string,
	jumlahChunk: number,
	jumlahBukti: number,
	adaPrompt: boolean,
): Omit<RagasScore, 'dihitungPada'> {
	const benih = sidikJari(html);
	/** 0,72–0,96; cukup untuk membuat ketiganya tidak pernah kembar. */
	const goyang = (offset: number) => ((benih >> offset) % 25) / 100;

	return {
		jumlahChunk,
		metrik: [
			{
				metrik: 'faithfulness',
				nilai: Number((0.72 + goyang(0)).toFixed(2)),
				alasan: `Seluruh pernyataan hasil generate ditelusuri ke ${jumlahChunk} potongan sumber; yang menyebut nama berkas secara langsung ada ${jumlahBukti}.`,
			},
			{
				metrik: 'response_relevancy',
				nilai: Number((0.72 + goyang(4)).toFixed(2)),
				alasan: adaPrompt
					? 'Hasilnya menjawab bab yang diminta sekaligus arahan tambahan yang diisi penyusun.'
					: 'Hasilnya menjawab bab yang diminta; tidak ada arahan tambahan yang perlu ikut dipenuhi.',
			},
			{
				metrik: 'context_precision',
				nilai: Number((0.72 + goyang(8)).toFixed(2)),
				alasan: `Dari ${jumlahChunk} potongan yang diambil, sebagian besar terpakai di tulisan akhir — sisanya ikut terambil karena berada di dokumen yang sama.`,
			},
		],
	};
}

/**
 * Lolos ke HTML sebagai teks, bukan markup. Nama berkas datang dari unggahan
 * pengguna, jadi ia tidak boleh bisa menyelipkan tag ke dalam `kontenKerja`
 * yang nanti dirender Tiptap.
 */
function escapeHtml(teks: string): string {
	return teks
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export async function generateChapterContent(
	input: GenerateChapterInput,
): Promise<GenerateChapterResult> {
	await delay(GENERATE_DELAY_MS);

	const judul = escapeHtml(input.judulBab);
	const daftar = input.buktiDukung
		.map((bukti) => `<li>${escapeHtml(bukti.namaDokumen)}</li>`)
		.join('');

	const paragrafPrompt = input.prompt.trim()
		? `<p>Penyusunan bagian ini mengikuti arahan tambahan berikut: <em>${escapeHtml(
				input.prompt.trim(),
			)}</em></p>`
		: '';

	const html = [
		`<p>Bagian ${input.urutanBab} — ${judul} — disusun berdasarkan ${input.buktiDukung.length} bukti dukung yang dipilih penyusun beserta butir panduan LAM Teknik yang relevan dengan nomor bab ini.</p>`,
		`<p>Uraian berikut merangkum kondisi yang terekam pada dokumen pendukung, menautkannya dengan kriteria yang dituntut rubrik, lalu menutupnya dengan capaian yang sudah terukur pada periode berjalan. Setiap klaim pada paragraf ini dapat ditelusuri kembali ke berkas yang tercantum di bawah.</p>`,
		paragrafPrompt,
		`<p>Bukti dukung yang dipakai sebagai konteks:</p>`,
		`<ul>${daftar}</ul>`,
		`<p><em>Draf ini dihasilkan otomatis dan masih perlu ditinjau sebelum dikunci Penjamin Mutu.</em></p>`,
	]
		.filter(Boolean)
		.join('');

	const referensiChunkIds = [
		`chunk-panduan-${input.urutanBab}-01`,
		...input.buktiDukung.map((bukti) => `chunk-bukti-${bukti.id}-01`),
	];

	return {
		html,
		referensiChunkIds,
		ragas: hitungRagas(
			html,
			referensiChunkIds.length,
			input.buktiDukung.length,
			input.prompt.trim() !== '',
		),
	};
}
