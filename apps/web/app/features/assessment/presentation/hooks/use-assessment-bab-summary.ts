import * as React from 'react';

import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { assessmentVerdictRepository } from '../../data/repositories/assessment-verdict.repository';
import { rubricCriterionAmiRepository } from '../../data/repositories/rubric-criterion-ami.repository';
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
 * Itulah yang berlaku, dan menampilkan skor AI di editor sementara dokumen
 * resmi menyebut angka lain akan membuat penyusun mengejar target yang salah.
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
			const proyek = await ledProjectRepository.findById(ledProjectId);
			const semuaKriteria = await rubricCriterionAmiRepository.findAll(
				proyek?.accreditationSetId,
			);
			const kriteria = semuaKriteria.filter((k) =>
				k.urutanBab.includes(urutanBab),
			);
			if (dibatalkan) return;
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
