import * as React from 'react';

import {
	kutipanUntukPedoman,
	kutipanUntukRubrik,
	type PanduanChunk,
} from '../../data/sources/remote/chapter-guidance.mock';
import {
	findPanduanForBab,
	findRubrikDipakaiForBab,
	sumberRubrik,
} from '../../domain/entities/guidance-point.entity';
import { rubricScoreTypeLabels } from '../../domain/entities/rubric-criterion.entity';

export type BarisPanduan = {
	/** Kunci baris terbuka di panel — id, bukan objeknya, seperti tab Bukti. */
	id: string;
	judul: string;
	/** Baris kedua: sumber + halaman, atau kode kriteria + tipe skor. */
	jejak: string;
	/** Kalimat pembuka laci; berbeda antar kelompok, jadi lacinya tetap bodoh. */
	pengantar: string;
	kutipan: PanduanChunk[];
};

export type KelompokPanduan = {
	kunci: 'pedoman' | 'rubrik';
	label: string;
	sumber: string;
	baris: BarisPanduan[];
};

/**
 * Isi tab Panduan: panduan LAM Teknik yang jadi rujukan bab ini
 * (docs/application_flow.md §11.1b), dalam dua kelompok yang memang terpisah di
 * pipeline sungguhan — `pedoman_used` (RAG 1) dan `rubric_used` (RAG 2) adalah
 * dua kolom berbeda di `generation_runs`, diambil dua fungsi retrieval berbeda.
 *
 * **Tanpa pemilih lingkup**, tidak seperti tab Bukti dan Kualitas AI. Bukti
 * dukung memang berbeda antar checkpoint karena penyusunnya yang memilih;
 * panduan murni turunan `urutanBab` dan sama di setiap checkpoint bab yang sama.
 * `Select` yang seluruh pilihannya menghasilkan daftar identik bukan cuma derau
 * — ia menyiratkan variasi yang tidak ada. Ia baru berarti saat `pedoman_used`
 * per generate benar-benar tersimpan.
 *
 * **Tanpa langganan `storage-update`.** Tidak ada satu pun sumbernya yang bisa
 * berubah dari tab lain; ini fungsi murni atas satu angka.
 */
export function useChapterGuidance({ urutanBab }: { urutanBab: number }) {
	return React.useMemo(() => {
		const pedoman = findPanduanForBab(urutanBab).map<BarisPanduan>((poin) => {
			const kutipan = kutipanUntukPedoman({ urutanBab, poin });
			const halamanAwal = kutipan[0]?.asal ?? '';
			const halamanAkhir = kutipan.at(-1)?.asal ?? '';

			return {
				id: poin.id,
				judul: `${poin.kodePoin} ${poin.judulPoin}`,
				// Hanya halamannya. Nama dokumen sumbernya sudah dipikul judul
				// kelompok di atas daftar; mengulanginya di tiap baris menyewa satu
				// baris penuh untuk mengabarkan hal yang sama berkali-kali.
				jejak:
					halamanAwal === halamanAkhir
						? halamanAwal
						: `${halamanAwal}–${halamanAkhir.replace('hlm. ', '')}`,
				pengantar: `${kutipan.length} bagian panduan ini dirujuk saat menyusun bab tersebut.`,
				kutipan,
			};
		});

		const rubrik = findRubrikDipakaiForBab(urutanBab).map<BarisPanduan>(
			(butir) => ({
				id: butir.kriteria.id,
				judul: butir.kriteria.deskripsi,
				jejak: `${butir.kriteria.kodeKriteria} · ${rubricScoreTypeLabels[butir.kriteria.tipeSkor]}`,
				pengantar:
					'Yang dikejar tulisan bab tersebut level tertinggi indikator ini.',
				kutipan: kutipanUntukRubrik(butir),
			}),
		);

		const kelompok = ([
			{
				kunci: 'pedoman',
				label: 'Pedoman penulisan',
				sumber: 'Panduan Penyusunan LED LAM Teknik',
				baris: pedoman,
			},
			{
				kunci: 'rubrik',
				label: 'Rubrik penilaian',
				sumber: sumberRubrik().judul,
				baris: rubrik,
			},
			// Kelompok kosong disaring di sini, bukan di komponennya: kelompok yang
			// tetap dirender akan menyewa dua baris untuk mengabarkan ketiadaan,
			// sementara panel sudah punya satu keadaan kosong yang mengabarkan hal
			// yang sama dengan lebih jelas.
		] satisfies KelompokPanduan[]).filter((grup) => grup.baris.length > 0);

		return {
			kelompok,
			/**
			 * Semua baris berurutan lintas kelompok. Navigasi ‹ › di laci memakai
			 * ini, bukan satu penghitung per kelompok: `{posisi}/{total}` yang
			 * berganti penyebut di tengah daftar tidak bisa dibaca sebagai apa pun.
			 */
			semuaBaris: kelompok.flatMap((grup) => grup.baris),
		};
	}, [urutanBab]);
}
