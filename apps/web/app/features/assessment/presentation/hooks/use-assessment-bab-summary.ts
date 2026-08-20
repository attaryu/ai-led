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
 * Ada supaya tab Rubrik di Editor Bab bisa menunjukkan angka yang sama dengan
 * halaman Penilaian AMI, bukan angka keduanya sendiri.
 *
 * `null` bila dokumennya belum pernah dinilai atau bab ini memang tidak dinilai
 * indikator mana pun.
 */
export function useAssessmentBabSummary(
	ledProjectId: string,
	urutanBab: number,
): AssessmentBabSummary | null {
	const [ringkas, setRingkas] = React.useState<AssessmentBabSummary | null>(
		null,
	);

	React.useEffect(() => {
		let dibatalkan = false;

		async function muat() {
			const kriteria = findKriteriaForBab(urutanBab);
			if (kriteria.length === 0) {
				if (!dibatalkan) setRingkas(null);
				return;
			}

			const sesiSemua = await assessmentSessionRepository.findByDokumenId(
				ledProjectId,
			);
			const sesi = sesiSemua[0];
			if (!sesi || sesi.status !== 'COMPLETED') {
				if (!dibatalkan) setRingkas(null);
				return;
			}

			const [hasil, keputusan] = await Promise.all([
				assessmentSessionRepository.findResultsBySession(sesi.id),
				assessmentVerdictRepository.findByDokumenId(ledProjectId),
			]);
			if (dibatalkan) return;

			const baris = gabungPenilaian({ kriteria, hasil, keputusan });
			setRingkas({ sesi, ringkasan: ringkasPenilaian(baris) });
		}

		void muat();
		return () => {
			dibatalkan = true;
		};
	}, [ledProjectId, urutanBab]);

	return ringkas;
}
