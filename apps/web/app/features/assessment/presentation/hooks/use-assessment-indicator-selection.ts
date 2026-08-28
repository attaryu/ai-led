import * as React from 'react';

import {
	assessmentRemoteSource,
	type AssessmentIndicator,
} from '../../data/sources/remote/assessment.remote-source';

/**
 * Daftar 78 indikator AMI beserta mana saja yang dipilih untuk dinilai.
 * Bawaannya seluruh indikator terpilih (sama seperti perilaku lama —
 * `indikatorList` kosong berarti nilai semua), pengguna lalu boleh
 * mempersempitnya lewat checklist.
 */
export function useAssessmentIndicatorSelection() {
	const [daftar, setDaftar] = React.useState<AssessmentIndicator[]>([]);
	const [terpilih, setTerpilih] = React.useState<Set<number>>(() => new Set());
	const [cari, setCari] = React.useState('');
	const sudahDiinit = React.useRef(false);

	React.useEffect(() => {
		assessmentRemoteSource.findIndicators().then((list) => {
			setDaftar(list);
			// Hanya sekali — supaya pilihan pengguna tidak ketiban ulang kalau
			// daftarnya kebetulan dimuat ulang.
			if (!sudahDiinit.current) {
				setTerpilih(new Set(list.map((indikator) => indikator.no)));
				sudahDiinit.current = true;
			}
		});
	}, []);

	const tersaring = React.useMemo(() => {
		const kunci = cari.trim().toLowerCase();
		if (!kunci) return daftar;
		return daftar.filter(
			(indikator) =>
				String(indikator.no).includes(kunci) ||
				indikator.kriteria.toLowerCase().includes(kunci),
		);
	}, [daftar, cari]);

	const toggle = (no: number) =>
		setTerpilih((sebelumnya) => {
			const berikutnya = new Set(sebelumnya);
			if (!berikutnya.delete(no)) berikutnya.add(no);
			return berikutnya;
		});

	const pilihSemua = () => setTerpilih(new Set(daftar.map((indikator) => indikator.no)));
	const kosongkan = () => setTerpilih(new Set());

	/** `undefined` = "semua" — dikirim apa adanya ke backend (indikatorList kosong berarti nilai semua). */
	const indikatorList = React.useMemo(
		() =>
			daftar.length > 0 && terpilih.size === daftar.length
				? undefined
				: [...terpilih],
		[daftar, terpilih],
	);

	return {
		daftar,
		tersaring,
		terpilih,
		cari,
		setCari,
		toggle,
		pilihSemua,
		kosongkan,
		indikatorList,
	};
}
