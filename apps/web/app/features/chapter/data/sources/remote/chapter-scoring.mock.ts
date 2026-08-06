/**
 * Tiruan sisi jaringan untuk simulasi skor rubrik
 * (docs/application_flow.md §9, docs/architecture.md §"RAG Pipeline").
 *
 * Ini **satu-satunya berkas yang perlu diganti** saat backend siap, mengikuti
 * kebiasaan `evidence-upload.mock.ts` dan `chapter-generation.mock.ts`. Alur
 * sebenarnya menilai `konten_kerja`/`konten_snapshot` terhadap tiap kriteria
 * dengan AI; yang tidak ditiru di sini sifat asinkronnya — yang asli mengantre
 * lewat Redis stream lalu di-poll.
 */

/** Cukup lama untuk memperlihatkan keadaan memuat, cukup pendek untuk dites. */
export const SCORING_DELAY_MS = 2400;

export type ScoreChapterInput = {
	/** HTML `kontenKerja` atau `kontenSnapshot` yang dinilai. */
	konten: string;
	kriteria: { id: string; kodeKriteria: string; skorMaksimal: number }[];
};

export type ScoreChapterResult = {
	hasil: { kriteriaId: string; skorDidapat: number; justifikasi: string }[];
};

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sidik jari isi + kode kriteria.
 *
 * Skornya **deterministik**, bukan acak, dan itu bukan sekadar demi uji yang
 * bisa diulang: docs menyatakan skor sebuah checkpoint tidak berubah kecuali
 * sengaja di-run ulang, dan `kontenSnapshot` checkpoint memang tidak pernah
 * berubah. Penilai acak akan membuat janji itu bohong — menjalankan ulang pada
 * isi yang sama persis akan memberi angka berbeda, dan tidak ada cara
 * membedakannya dari kesalahan sungguhan.
 */
function sidikJari(teks: string): number {
	let nilai = 0;
	for (let i = 0; i < teks.length; i += 1) {
		nilai = (nilai * 31 + teks.charCodeAt(i)) >>> 0;
	}
	return nilai;
}

/** Teks murni dari HTML, supaya panjangnya mencerminkan tulisan, bukan markup. */
function teksPolos(html: string): string {
	return html
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Alasan skornya, **bukan** pengulangan bunyi level rubriknya.
 *
 * Versi pertama berkas ini menulis kalimat yang nyaris sama persis dengan
 * `levelStandar()` di entitas kriteria, sehingga di layar kalimat itu muncul dua
 * kali — sekali sebagai alasan, sekali lagi di daftar level — dan bagian
 * "alasan" jadi tidak menjelaskan apa pun. Yang ditulis di sini menyebut kondisi
 * **bab ini**: seberapa panjang tulisannya dan apakah ia menyebut berkas
 * pendukung. Itulah yang akan dilakukan penilai sungguhan, dan itulah yang
 * membuat angkanya bisa ditindaklanjuti.
 */
function justifikasi(skor: number, jumlahKata: number, menyebutBukti: boolean): string {
	const panjang = `${jumlahKata} kata`;

	switch (skor) {
		case 1:
			return `Tulisan bab baru ${panjang} dan belum memuat uraian yang bisa dinilai untuk kriteria ini.`;
		case 2:
			return menyebutBukti
				? `Uraiannya sudah ada (${panjang}) dan menyebut berkas pendukung, tapi isinya belum menjelaskan angka atau kondisi yang bisa ditelusuri.`
				: `Uraiannya sudah ada (${panjang}), tapi belum satu pun berkas pendukung disebut sebagai dasar pernyataannya.`;
		case 3:
			return `Uraian sepanjang ${panjang} sudah bertumpu pada berkas pendukung yang dirujuk bab ini, tapi belum ditutup dengan rencana tindak lanjut.`;
		default:
			return `Uraian sepanjang ${panjang} lengkap, menyebut berkas pendukungnya, dan sudah sampai pada rencana tindak lanjut yang bisa diukur.`;
	}
}

export async function scoreChapterContent(
	input: ScoreChapterInput,
): Promise<ScoreChapterResult> {
	await delay(SCORING_DELAY_MS);

	const teks = teksPolos(input.konten);
	const jumlahKata = teks === '' ? 0 : teks.split(' ').length;
	// Penanda kasar bahwa babnya merujuk berkas: hasil generate memang menyusun
	// daftar nama berkasnya, dan nama berkas selalu berekstensi.
	const menyebutBukti = /\.(pdf|docx?|xlsx?|jpe?g|png)\b/i.test(input.konten);

	// Bab yang tulisannya lebih panjang cenderung dapat lebih tinggi — bukan
	// penilaian sungguhan, tapi cukup untuk membuat angkanya bergerak masuk akal
	// saat isi bab berubah.
	const bobotIsi = Math.min(3, Math.floor(teks.length / 320));

	return {
		hasil: input.kriteria.map((kriteria) => {
			const goyangan =
				sidikJari(`${kriteria.kodeKriteria}:${teks}`) % 2 === 0 ? 1 : 0;
			const skorDidapat = Math.min(
				kriteria.skorMaksimal,
				Math.max(1, bobotIsi + goyangan),
			);

			return {
				kriteriaId: kriteria.id,
				skorDidapat,
				justifikasi: justifikasi(skorDidapat, jumlahKata, menyebutBukti),
			};
		}),
	};
}
