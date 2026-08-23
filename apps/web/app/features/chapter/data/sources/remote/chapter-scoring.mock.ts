/**
 * Mesin penilai tiruan untuk indikator LAM Teknik
 * (docs/application_flow.md §9, docs/architecture.md §"RAG Pipeline").
 *
 * Ini **satu-satunya berkas yang perlu diganti** saat backend siap, mengikuti
 * kebiasaan `evidence-upload.mock.ts` dan `chapter-generation.mock.ts`. Alur
 * sebenarnya menilai `konten_kerja`/`konten_snapshot` terhadap tiap kriteria
 * dengan AI; yang tidak ditiru di sini sifat asinkronnya — yang asli mengantre
 * lewat Redis stream lalu di-poll.
 *
 * **Letaknya di `chapter/`, pemakainya Penilaian AMI.** Dulu berkas ini melayani
 * simulasi skor di tab Rubrik Editor Bab; tab itu sudah dihapus, dan yang
 * tersisa memanggilnya adalah `assessment-run.mock.ts` beserta
 * `assessment-eval.mock.ts`. Ia tetap tinggal di sini karena fitur `chapter`
 * yang memiliki domain rubriknya — `rubric-criterion.entity.ts`, master
 * indikator yang dibaca kedua fitur — dan memindahkannya hanya akan memisahkan
 * mesin skor dari daftar kriteria yang dinilainya.
 */

export function delay(ms: number): Promise<void> {
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
 *
 * Untuk Penilaian AMI janji itu justru lebih penting lagi: koreksi Penjamin Mutu
 * disimpan bersama skor mesin yang dikoreksinya, dan penanda "koreksi ini sudah
 * basi" bekerja dengan membandingkan keduanya. Penilai acak akan membuat seluruh
 * koreksi tampak basi setiap kali penilaian diulang.
 */
export function sidikJari(teks: string): number {
	let nilai = 0;
	for (let i = 0; i < teks.length; i += 1) {
		nilai = (nilai * 31 + teks.charCodeAt(i)) >>> 0;
	}
	return nilai;
}

/** Teks murni dari HTML, supaya panjangnya mencerminkan tulisan, bukan markup. */
export function teksPolos(html: string): string {
	return html
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Penanda kasar bahwa tulisannya merujuk berkas: hasil generate memang menyusun
 * daftar nama berkasnya, dan nama berkas selalu berekstensi.
 */
export function menyebutBerkas(html: string): boolean {
	return /\.(pdf|docx?|xlsx?|jpe?g|png)\b/i.test(html);
}

/**
 * Alasan skornya, **bukan** pengulangan bunyi level rubriknya.
 *
 * Versi pertama berkas ini menulis kalimat yang nyaris sama persis dengan
 * `levelStandar()` di entitas kriteria, sehingga di layar kalimat itu muncul dua
 * kali — sekali sebagai alasan, sekali lagi di daftar level — dan bagian
 * "alasan" jadi tidak menjelaskan apa pun. Yang ditulis di sini menyebut kondisi
 * **tulisan ini**: seberapa panjang dan apakah ia menyebut berkas pendukung.
 * Itulah yang akan dilakukan penilai sungguhan, dan itulah yang membuat angkanya
 * bisa ditindaklanjuti.
 */
function justifikasi(
	skor: number,
	jumlahKata: number,
	menyebutBukti: boolean,
): string {
	const panjang = `${jumlahKata} kata`;

	switch (skor) {
		case 0:
			return `Tidak ada tulisan yang bisa dinilai untuk kriteria ini (${panjang}).`;
		case 1:
			return `Tulisan baru ${panjang} dan belum memuat uraian yang menjawab kriteria ini.`;
		case 2:
			return menyebutBukti
				? `Uraiannya sudah ada (${panjang}) dan menyebut berkas pendukung, tapi isinya belum menjelaskan angka atau kondisi yang bisa ditelusuri.`
				: `Uraiannya sudah ada (${panjang}), tapi belum satu pun berkas pendukung disebut sebagai dasar pernyataannya.`;
		case 3:
			return `Uraian sepanjang ${panjang} sudah bertumpu pada berkas pendukung yang dirujuk, tapi belum ditutup dengan rencana tindak lanjut.`;
		default:
			return `Uraian sepanjang ${panjang} lengkap, menyebut berkas pendukungnya, dan sudah sampai pada rencana tindak lanjut yang bisa diukur.`;
	}
}

export type NilaiKriteriaHasil = {
	skorDidapat: number;
	justifikasi: string;
	/** Jumlah kata teks polos, dipakai pemanggil untuk keterangan tambahan. */
	jumlahKata: number;
	menyebutBukti: boolean;
};

/**
 * Menilai satu kriteria atas satu potong tulisan.
 *
 * `kunci` adalah apa pun yang membedakan kriteria ini dari yang lain (kode atau
 * nomor indikator) — ia hanya masuk ke sidik jari supaya dua kriteria atas
 * tulisan yang sama tidak selalu mendapat angka identik.
 */
export function nilaiKriteria(
	konten: string,
	kunci: string,
	skorMaksimalKriteria: number,
): NilaiKriteriaHasil {
	const teks = teksPolos(konten);
	const jumlahKata = teks === '' ? 0 : teks.split(' ').length;
	const menyebutBukti = menyebutBerkas(konten);

	// Tulisan yang lebih panjang cenderung dapat lebih tinggi — bukan penilaian
	// sungguhan, tapi cukup untuk membuat angkanya bergerak masuk akal saat isinya
	// berubah.
	const bobotIsi = Math.min(3, Math.floor(teks.length / 320));
	const goyangan = sidikJari(`${kunci}:${teks}`) % 2 === 0 ? 1 : 0;
	const skorDidapat = Math.min(
		skorMaksimalKriteria,
		Math.max(0, bobotIsi + goyangan),
	);

	return {
		skorDidapat,
		justifikasi: justifikasi(skorDidapat, jumlahKata, menyebutBukti),
		jumlahKata,
		menyebutBukti,
	};
}
