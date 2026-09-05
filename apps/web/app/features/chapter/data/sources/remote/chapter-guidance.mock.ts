import {
	rubricScoreTypeLabels,
	type RubricScoreType,
} from '../../../domain/entities/rubric-criterion.entity';
import {
	findPanduanForBab,
	type ButirRubrikDipakai,
	type PoinPanduan,
} from '../../../domain/entities/guidance-point.entity';

/**
 * Kutipan panduan yang dipakai AI saat menyusun sebuah bab
 * (docs/application_flow.md §11.1b).
 *
 * Ini **satu-satunya berkas yang perlu diganti** saat backend siap, mengikuti
 * kebiasaan `chapter-chunk.mock.ts` dan `chapter-generation.mock.ts`. Yang
 * sungguhan datang dari `generation_runs.pedoman_used` (RAG 1) dan `rubric_used`
 * (RAG 2) — dua kolom terpisah berisi `[{ id, text }]` (docs/database.md).
 *
 * **Terpisah dari `chapter-chunk.mock.ts`, bukan memakai ulangnya.** Yang itu
 * menggantikan `chunks_used`, masukannya `BuktiDukungRef`, dan pustakanya
 * dikunci token nama berkas. Yang ini menggantikan dua kolom lain, masukannya
 * poin panduan, dan isinya diturunkan dari poinnya sendiri. Menyatukan keduanya
 * berarti satu berkas yang saat backend siap cuma separuhnya boleh dihapus.
 *
 * **Halamannya dihitung, bukan diacak.** Urutannya sudah intrinsik — poin `4.1`
 * mendahului `4.5` di dokumen aslinya — jadi tidak ada yang perlu dijinakkan
 * `sidikJari`: tidak ada yang perlu diacak, jadi tidak ada yang perlu
 * dijinakkan. Sekaligus menghindarkan seluruh persoalan geser
 * bertanda yang pernah membuat halaman mundur di mock kutipan bukti dukung.
 *
 * **Kutipan rubrik tidak punya halaman, dan itu bukan kelalaian.** Matriks
 * penilaian sebuah **tabel**, bukan dokumen naratif berhalaman — `search_rubric`
 * di `apps/ai` pun mengembalikan potongan bermetadata `sub_bab`, tanpa halaman
 * di mana pun. Nomor halaman untuk satu sel rubrik tidak punya dasar apa pun,
 * sejenis dengan skor kemiripan yang sengaja ditinggalkan
 * `chapter-chunk.mock.ts`. Karena itu asalnya diisi keterangan provenans
 * ("Bunyi kriteria", "Skor 4", "Sumber angka"), bukan halaman.
 */
export type PanduanChunk = {
	id: string;
	kutipan: string;
	/**
	 * Asal potongan, **sudah jadi**: `hlm. 24` untuk pedoman, `Skor 4` untuk
	 * rubrik.
	 *
	 * Dirakit di sini, bukan di komponen seperti `KutipanChunk` di tab Bukti.
	 * Alasannya bukan selera: potongan pedoman punya halaman, potongan rubrik
	 * tidak. Membiarkan komponen memilih di antara keduanya berarti menaruh
	 * pengetahuan tentang bentuk sumber datanya di lapisan yang paling tidak
	 * berhak memilikinya.
	 */
	asal: string;
	/** Keterangan kedua di eyebrow; `null` bila tidak ada yang perlu ditambah. */
	judulBagian: string | null;
};

/** Halaman poin panduan pertama; sisanya menaik dari sini. */
const HALAMAN_AWAL = 18;
/** Berapa halaman satu poin menempati di dokumen aslinya. */
const HALAMAN_PER_POIN = 2;
/** Berapa nama indikator yang muat dalam satu halaman panduan. */
const INDIKATOR_PER_HALAMAN = 4;

/**
 * Keterangan singkat tiap tipe skor.
 *
 * Bunyinya diambil dari alasan yang sudah ditulis `rubricScoreTypeEnum`:
 * bedanya nyata, bukan label — indikator kuantitatif dihitung dari tabel LKPS
 * dan tidak membaik seberapa pun narasinya ditambah.
 */
const CATATAN_TIPE: Record<RubricScoreType, string> = {
	kuantitatif: 'Dinilai dari angka tabel LKPS, bukan dari narasi.',
	kualitatif: 'Dinilai dari uraian yang ditulis di LED.',
	komposit: 'Dinilai dari angka LKPS dan uraian LED sekaligus.',
};

/**
 * Potongan pedoman penulisan yang dipakai satu bab (`pedoman_used`, RAG 1).
 *
 * Potongan pertama selalu `isiTeks` poin itu sendiri — itu memang yang di-chunk
 * dan di-index menurut docs/database.md §14, bukan berkas mentahnya. Sisanya
 * satu potongan per nama indikator, yang sekaligus menaruh daftar panjang (dua
 * belas indikator untuk Kriteria 4) di laci, bukan di kolom 320 px.
 */
export function kutipanUntukPedoman({
	urutanBab,
	poin,
}: {
	urutanBab: number;
	poin: PoinPanduan;
}): PanduanChunk[] {
	const urutanPoin = findPanduanForBab(urutanBab).findIndex(
		(kandidat) => kandidat.id === poin.id,
	);
	const halamanDasar =
		HALAMAN_AWAL + Math.max(urutanPoin, 0) * HALAMAN_PER_POIN;
	const nomor = (urutan: number) =>
		`chunk-pedoman-${poin.id}-${String(urutan).padStart(2, '0')}`;

	return [
		{
			id: nomor(1),
			kutipan: poin.isiTeks,
			asal: `hlm. ${halamanDasar}`,
			judulBagian: null,
		},
		...poin.iku.map((butir, urutan) => ({
			id: nomor(urutan + 2),
			kutipan: `${butir.nama}. ${CATATAN_TIPE[butir.tipeSkor]}`,
			asal: `hlm. ${halamanDasar + Math.floor(urutan / INDIKATOR_PER_HALAMAN)}`,
			judulBagian: rubricScoreTypeLabels[butir.tipeSkor],
		})),
	];
}

/**
 * Potongan rubrik yang jadi sasaran tulisan satu bab (`rubric_used`, RAG 2 —
 * didokumentasikan sebagai teks rubrik pada skor tertinggi).
 *
 * **Nol karangan di sini.** Ketiga potongannya seluruhnya `RUBRIK_KRITERIA` yang
 * sudah ada: bunyi kriterianya, teks level tertinggi, dan tabel LKPS yang jadi
 * sumber angkanya. Yang dikerjakan fungsi ini hanya menyusunnya jadi bentuk yang
 * sama dengan potongan pedoman, supaya satu laci bisa menampilkan keduanya.
 */
export function kutipanUntukRubrik(butir: ButirRubrikDipakai): PanduanChunk[] {
	const { kriteria, target } = butir;
	const nomor = (urutan: number) =>
		`chunk-rubrik-${kriteria.id}-${String(urutan).padStart(2, '0')}`;

	const potongan: PanduanChunk[] = [
		{
			id: nomor(1),
			kutipan: kriteria.deskripsi,
			asal: 'Bunyi kriteria',
			judulBagian: kriteria.kodeKriteria,
		},
		{
			id: nomor(2),
			kutipan: target.deskripsi,
			asal: `Skor ${target.skor}`,
			judulBagian: kriteria.kodeKriteria,
		},
	];

	// Kriteria tanpa tabel LKPS tidak mendapat potongan ketiga, dan kosongnya
	// bermakna: ia menyatakan indikator ini dinilai sepenuhnya dari narasi LED.
	if (kriteria.tabelLkps.length > 0) {
		potongan.push({
			id: nomor(3),
			kutipan: kriteria.tabelLkps.join(' · '),
			asal: 'Sumber angka',
			judulBagian: kriteria.kodeKriteria,
		});
	}

	return potongan;
}
