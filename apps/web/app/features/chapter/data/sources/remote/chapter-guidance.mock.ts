import { type ButirRubrikDipakai, type PoinPanduan } from '../../../domain/entities/guidance-point.entity';

/** Kutipan panduan dipakai AI saat menyusun bab. Tanpa nomor halaman (worker belum melacaknya per sub-bab) -- `asal` provenans singkat aja. */
export type PanduanChunk = {
	id: string;
	kutipan: string;
	/** Asal potongan -- keterangan provenans singkat, bukan halaman (lihat catatan berkas ini). */
	asal: string;
	/** Keterangan kedua di eyebrow; `null` bila tidak ada yang perlu ditambah. */
	judulBagian: string | null;
};

/** Satu poin pedoman = satu potongan, teks nyata hasil ekstraksi. */
export function kutipanUntukPedoman({ poin }: { poin: PoinPanduan }): PanduanChunk[] {
	return [
		{
			id: `chunk-pedoman-${poin.id}-01`,
			kutipan: poin.isiTeks,
			asal: 'Struktur Panduan Penulisan',
			judulBagian: null,
		},
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
