/**
 * Satu kartu rekomendasi dokumen dari AI untuk bab yang sedang dibuka.
 *
 * **Yang direkomendasikan adalah ISI, bukan berkas.** Kartunya tidak menyebut
 * nama berkas tertentu di pustaka, dan tidak pula memilih dari katalog jenis
 * dokumen — ia memerikan *dokumen yang isinya apa* yang dibutuhkan bab ini.
 * Penyusun sendiri yang tahu berkas mana di kampusnya memuat itu. Bentuk ini
 * berbeda dari dua pendahulunya, dan bedanya disengaja:
 *
 * - `RekomendasiBukti`, blok yang digantikannya (dihapus bersama commit ini),
 *   menyebut nama artefak lalu menempelkan kode kriteria (`C2 · bukti mutu
 *   tiap kerja sama`). Kode kriteria dibuang di sini — kartunya berdiri
 *   sendiri tanpa perlu pembacanya paham penomoran LAM.
 * - `RecommendationItemEntity` di branch `dev-v1` memecah `label` dan `reason`
 *   jadi dua medan. Di kartu rujukan (prototipe Dimas) keduanya satu kalimat
 *   mengalir tanpa pemisah visual apa pun, jadi memecahnya berarti mengarang
 *   struktur yang tidak pernah dipakai saat merender.
 *
 * **Tanpa `order`.** Urutan sudah dibawa urutan larik, dan pengelompokannya
 * urusan backend — frontend merender apa adanya, tidak menyortir ulang.
 *
 * **Tanpa kaitan ke bukti dukung mana yang memenuhinya.** Belum ada satu pun
 * tampilan yang membutuhkannya; menambahkannya sekarang berarti satu medan
 * yang harus dijaga selaras tanpa pembaca.
 */
export type RekomendasiDokumen = {
	/** Stabil; key React sekaligus identitas kartu. */
	id: string;
	/**
	 * Satu kalimat utuh yang memerikan isi dokumen yang diminta, lazimnya
	 * berbentuk "X, termasuk a, b, dan c."
	 */
	deskripsi: string;
	/**
	 * `true` bila kebutuhan ini sudah terjawab bukti dukung yang dipakai bab.
	 *
	 * **Kesimpulan sistem, bukan fakta** — karena itu kartunya dilipat, tidak
	 * dibuang: kekeliruan yang disembunyikan tidak punya cara diperbaiki
	 * penggunanya.
	 */
	terpenuhi: boolean;
};
