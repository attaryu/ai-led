import * as React from 'react';

import { type PenilaianFinalRow } from '../../domain/entities/assessment-session.entity';

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
	const [terpilih, setTerpilih] = React.useState<Set<number>>(() => new Set());
	const sudahDiinit = React.useRef(false);

	React.useEffect(() => {
		if (baris.length > 0 && !sudahDiinit.current) {
			setTerpilih(new Set(baris.map((row) => row.kriteria.no)));
			sudahDiinit.current = true;
		}
	}, [baris]);

	const toggle = (no: number) =>
		setTerpilih((sebelumnya) => {
			const berikutnya = new Set(sebelumnya);
			if (!berikutnya.delete(no)) berikutnya.add(no);
			return berikutnya;
		});

	const pilihSemua = () =>
		setTerpilih(new Set(baris.map((row) => row.kriteria.no)));
	const kosongkan = () => setTerpilih(new Set());

	/** `undefined` = "semua" — dikirim apa adanya ke backend (indikatorList kosong berarti nilai semua). */
	const indikatorList = React.useMemo(
		() =>
			baris.length > 0 && terpilih.size === baris.length
				? undefined
				: [...terpilih],
		[baris, terpilih],
	);

	return { terpilih, toggle, pilihSemua, kosongkan, indikatorList };
}
