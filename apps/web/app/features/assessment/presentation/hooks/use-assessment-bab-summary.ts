import * as React from 'react';

import { findKriteriaForBab } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { assessmentVerdictRepository } from '../../data/repositories/assessment-verdict.repository';
import {
	gabungPenilaian,
	ringkasPenilaian,
	type AssessmentSessionEntity,
	type RingkasanPenilaian,
} from '../../domain/entities/assessment-session.entity';

export type AssessmentBabSummary = {
	sesi: AssessmentSessionEntity;
	ringkasan: RingkasanPenilaian;
};

/**
 * Skor final AMI untuk **satu bab**, dari sesi penilaian terakhir dokumennya.
 *
 * Ada supaya Editor Bab menunjukkan angka yang sama dengan halaman Penilaian
 * AMI, bukan angka miliknya sendiri. Editor sengaja tidak punya penilaian
 * terpisah: kalau ia menyimpan hasilnya sendiri, penyusun akan melihat satu
 * angka di editor dan Penjamin Mutu melihat angka lain untuk bab yang sama,
 * tanpa ada cara menjelaskan selisihnya.
 *
 * Yang ditampilkan **skor final** — sudah termasuk koreksi Penjamin Mutu.
 * Itulah yang berlaku, dan menampilkan skor mesin di editor sementara dokumen
 * resmi menyebut angka lain akan membuat penyusun mengejar target yang salah.
 *
 * `null` bila dokumennya belum pernah dinilai atau bab ini memang tidak dinilai
 * indikator mana pun — dua keadaan yang sah, dan keduanya cukup dijawab dengan
 * tidak menampilkan apa-apa.
 */
export function useAssessmentBabSummary(
	ledProjectId: string,
	urutanBab: number,
): AssessmentBabSummary | null {
	const [ringkas, setRingkas] = React.useState<AssessmentBabSummary | null>(
		null,
	);

	const muat = React.useCallback(() => {
		const kriteria = findKriteriaForBab(urutanBab);
		const sesi = assessmentSessionRepository.findLatest(ledProjectId);

		if (kriteria.length === 0 || !sesi || sesi.status !== 'COMPLETED') {
			setRingkas(null);
			return;
		}

		const baris = gabungPenilaian({
			kriteria,
			hasil: assessmentSessionRepository.findResultsBySession(sesi.id),
			keputusan: assessmentVerdictRepository.findByDokumenId(ledProjectId),
		});

		setRingkas({ sesi, ringkasan: ringkasPenilaian(baris) });
	}, [ledProjectId, urutanBab]);

	React.useEffect(() => {
		muat();
		window.addEventListener('storage-update', muat);
		return () => window.removeEventListener('storage-update', muat);
	}, [muat]);

	return ringkas;
}
