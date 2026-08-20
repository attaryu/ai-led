import * as React from 'react';

import { type AssessmentSessionEntity } from '../../domain/entities/assessment-session.entity';
import { type AssessmentPermission } from './use-assessment-permission';

export type StatusEvaluasi = 'diam' | 'berjalan' | 'gagal';

/**
 * Metrik RAGAS untuk satu sesi penilaian AMI.
 *
 * **Belum ada backing-nya sama sekali** (docs §12b: celah yang sama seperti
 * `AssessmentVerdict` sebelum tabelnya dibuat) — beda dari RAGAS per-bab di
 * Editor Bab, yang sudah dihitung `worker.py::_handle_generasi_bab` dan
 * ditulis ke `ragas_scores`. Tidak ada job/kolom manapun yang menghitung RAGAS
 * di level sesi AMI. `kualitas` karena itu selalu `null`, dan menjalankan
 * "evaluasi" di sini akan mengarang angka — jadi tombolnya melaporkan celah
 * ini apa adanya, bukan diam-diam memakai data contoh.
 */
export function useAssessmentQuality({
	sesi,
	izin,
}: {
	sesi: AssessmentSessionEntity | undefined;
	izin: AssessmentPermission;
}) {
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	const sesiSelesai = sesi?.status === 'COMPLETED';
	const bolehMengevaluasi = izin.canRun && sesiSelesai;

	const jalankanEvaluasi = React.useCallback(async () => {
		if (!bolehMengevaluasi) return;
		setPesanGagal(
			'Evaluasi kualitas RAGAS untuk sesi Penilaian AMI belum tersedia — belum ada pipeline yang menghitungnya.',
		);
	}, [bolehMengevaluasi]);

	return {
		kualitas: null,
		status: 'diam' as StatusEvaluasi,
		pesanGagal,
		bolehMengevaluasi,
		sesiSelesai,
		jalankanEvaluasi,
	};
}
