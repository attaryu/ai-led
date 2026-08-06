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

/** Cukup lama untuk memperlihatkan keadaan memuat, cukup pendek untuk dites. */
export const GENERATE_DELAY_MS = 2800;

export type GenerateChapterInput = {
	judulBab: string;
	urutanBab: number;
	/** Bukti dukung terpilih; hanya yang berstatus `SIAP` yang sampai ke sini. */
	buktiDukung: { namaDokumen: string }[];
	/** Arahan bebas dari penyusun; string kosong bila tidak diisi. */
	prompt: string;
};

export type GenerateChapterResult = {
	/** HTML, sesuai format `kontenKerja` (lihat `chapter.entity.ts`). */
	html: string;
};

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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

	return {
		html: [
			`<p>Bagian ${input.urutanBab} — ${judul} — disusun berdasarkan ${input.buktiDukung.length} bukti dukung yang dipilih penyusun beserta butir panduan LAM Teknik yang relevan dengan nomor bab ini.</p>`,
			`<p>Uraian berikut merangkum kondisi yang terekam pada dokumen pendukung, menautkannya dengan kriteria yang dituntut rubrik, lalu menutupnya dengan capaian yang sudah terukur pada periode berjalan. Setiap klaim pada paragraf ini dapat ditelusuri kembali ke berkas yang tercantum di bawah.</p>`,
			paragrafPrompt,
			`<p>Bukti dukung yang dipakai sebagai konteks:</p>`,
			`<ul>${daftar}</ul>`,
			`<p><em>Draf ini dihasilkan otomatis dan masih perlu ditinjau sebelum dikunci Penjamin Mutu.</em></p>`,
		]
			.filter(Boolean)
			.join(''),
	};
}
