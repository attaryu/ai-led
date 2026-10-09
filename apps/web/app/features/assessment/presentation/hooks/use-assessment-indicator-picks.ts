import * as React from 'react';

import {
	kunciIndikator,
	type PenilaianFinalRow,
} from '../../domain/entities/assessment-session.entity';

/**
 * Indikator mana yang ikut dinilai saat "Mulai Penilaian Otomatis"/"Nilai
 * Ulang" berikutnya — lepas sepenuhnya dari sesi mana pun.
 *
 * **Freestyle, bukan gerbang sebelum run pertama.** AI-nya berat (satu
 * indikator = satu pemanggilan LLM, puluhan detik), jadi pengguna perlu bisa
 * mencicil: centang beberapa, nilai, lihat hasilnya, centang kombinasi lain,
 * nilai lagi — kapan saja, sebelum atau sesudah sesi mana pun ada, tidak
 * dikunci ke "pilihan cuma berlaku untuk run pertama". Makanya state ini
 * tinggal di komponen halaman (React state biasa, bukan disimpan per sesi)
 * dan sengaja TIDAK direset saat sesi baru selesai.
 *
 * Bawaannya seluruh indikator terpilih (`baris` sekarang selalu berisi
 * seluruh 64 indikator matriks — lihat use-assessment-results.ts), sekali
 * saja saat baris pertama kali termuat, supaya klik pertama "Mulai Penilaian
 * Otomatis" tanpa menyentuh checkbox tetap menilai semuanya seperti
 * perilaku lama.
 */
export function useAssessmentIndicatorPicks(baris: PenilaianFinalRow[]) {
	// Kunci = nomor + sub-indikator ("43|I"): 43.I dan 43.II dipilih dan dinilai terpisah.
	// ponytail: dulu Set<number> (per nomor indikator saja).
	const [terpilih, setTerpilih] = React.useState<Set<string>>(() => new Set());
	const sudahDiinit = React.useRef(false);

	React.useEffect(() => {
		if (baris.length > 0 && !sudahDiinit.current) {
			setTerpilih(new Set(baris.map((row) => kunciIndikator(row.kriteria.no, row.kriteria.subNo))));
			sudahDiinit.current = true;
		}
	}, [baris]);

	const toggle = (kunci: string) =>
		setTerpilih((sebelumnya) => {
			const berikutnya = new Set(sebelumnya);
			if (!berikutnya.delete(kunci)) berikutnya.add(kunci);
			return berikutnya;
		});

	const pilihSemua = () =>
		setTerpilih(new Set(baris.map((row) => kunciIndikator(row.kriteria.no, row.kriteria.subNo))));
	const kosongkan = () => setTerpilih(new Set());

	const semua = baris.length > 0 && terpilih.size === baris.length;

	/** `undefined` = "semua" — dikirim apa adanya ke backend. Nomor indikator unik dari baris terpilih (kompatibilitas). */
	const indikatorList = React.useMemo(
		() =>
			semua
				? undefined
				: [
						...new Set(
							baris
								.filter((row) => terpilih.has(kunciIndikator(row.kriteria.no, row.kriteria.subNo)))
								.map((row) => row.kriteria.no),
						),
					],
		[baris, terpilih, semua],
	);

	/** Kunci "nomor|sub" baris yang dipilih; menentukan sub-indikator mana yang dinilai. `undefined` = semua. */
	const subIndikatorList = React.useMemo(() => (semua ? undefined : [...terpilih]), [terpilih, semua]);

	return { terpilih, toggle, pilihSemua, kosongkan, indikatorList, subIndikatorList };
}
