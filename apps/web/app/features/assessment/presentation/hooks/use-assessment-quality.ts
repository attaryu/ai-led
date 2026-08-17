import * as React from 'react';

import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { runAssessmentEval } from '../../data/sources/remote/assessment-eval.mock';
import { type AssessmentSessionEntity } from '../../domain/entities/assessment-session.entity';
import { type AssessmentPermission } from './use-assessment-permission';

export type StatusEvaluasi = 'diam' | 'berjalan' | 'gagal';

/**
 * Metrik RAGAS untuk satu sesi penilaian, beserta cara menghitungnya bila belum
 * ada.
 *
 * **Hampir nol tombol.** Yang asli menghitung evaluasi begitu penilaian selesai,
 * jadi sesi yang sehat sudah datang dengan angkanya — sejalan dengan alasan yang
 * ditulis `chapter-quality-panel.tsx` untuk tab Kualitas AI yang sama sekali
 * tanpa tombol. Tombolnya di sini hanya muncul untuk sesi yang **belum** punya
 * metrik: tanpa itu, sesi lama yang lahir sebelum evaluasi ada tidak akan pernah
 * bisa dievaluasi sama sekali.
 */
export function useAssessmentQuality({
	sesi,
	izin,
	/** Isi yang dinilai; ikut jadi sidik jari supaya angkanya deterministik. */
	konten,
}: {
	sesi: AssessmentSessionEntity | undefined;
	izin: AssessmentPermission;
	konten: string;
}) {
	const [status, setStatus] = React.useState<StatusEvaluasi>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	const kualitas = sesi?.kualitas ?? null;
	const sesiId = sesi?.id;
	const sesiSelesai = sesi?.status === 'COMPLETED';

	// Tombolnya hanya untuk sesi selesai yang belum punya angka: sesi yang masih
	// berjalan belum punya justifikasi lengkap untuk dievaluasi, dan sesi gagal
	// tidak akan pernah punya.
	const bolehMengevaluasi =
		izin.canRun && sesiSelesai && kualitas === null && status !== 'berjalan';

	const jalankanEvaluasi = React.useCallback(async () => {
		if (!bolehMengevaluasi || !sesiId) return;

		setStatus('berjalan');
		setPesanGagal(null);

		try {
			const hasil = await runAssessmentEval({
				sesiId,
				indikatorNos: assessmentSessionRepository
					.findResultsBySession(sesiId)
					.filter((baris) => baris.error === null)
					.map((baris) => baris.indikatorNo),
				konten,
			});

			assessmentSessionRepository.setKualitas(sesiId, {
				...hasil,
				dihitungPada: new Date().toISOString(),
			});
			setStatus('diam');
		} catch {
			setStatus('gagal');
			setPesanGagal(
				'Evaluasi gagal diselesaikan. Periksa koneksi lalu coba lagi.',
			);
		}
	}, [bolehMengevaluasi, sesiId, konten]);

	return {
		kualitas,
		status,
		pesanGagal,
		bolehMengevaluasi,
		sesiSelesai,
		jalankanEvaluasi,
	};
}
