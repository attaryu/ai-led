import * as React from 'react';

import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { type AssessmentQuality } from '../../domain/entities/assessment-quality.entity';
import { type AssessmentSessionEntity } from '../../domain/entities/assessment-session.entity';
import { type AssessmentPermission } from './use-assessment-permission';

export type StatusEvaluasi = 'diam' | 'berjalan' | 'gagal';

/** Jarak antar-poll status evaluasi — RAGAS jalan sinkron per indikator di apps/ai, tidak ada SSE untuk ini. */
const JEDA_POLL_MS = 2000;

/**
 * Metrik RAGAS untuk satu sesi penilaian AMI (`apps/ai/eval/ragas_eval.py`,
 * `POST /eval/run` lewat proxy NestJS `POST /assessment-sessions/:id/eval`).
 *
 * **Dipicu manual, bukan otomatis** — beda dari RAGAS per-bab di Editor Bab
 * yang dihitung `worker.py::_handle_generasi_bab` sebagai efek samping
 * generate. Hasilnya ditimpa (bukan riwayat) di kolom `AssessmentSession.kualitas`
 * tiap "Jalankan Evaluasi" ditekan (docs §12b(3)) — state di sini cuma seeded
 * dari situ saat sesi dibuka/berganti, refresh halaman TIDAK menghilangkannya.
 */
export function useAssessmentQuality({
	sesi,
	izin,
}: {
	sesi: AssessmentSessionEntity | undefined;
	izin: AssessmentPermission;
}) {
	const [kualitas, setKualitas] = React.useState<AssessmentQuality | null>(
		sesi?.kualitas ?? null,
	);
	const [status, setStatus] = React.useState<StatusEvaluasi>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	// Sesi berganti (mis. pindah dokumen) sebelum polling lama selesai — hasil
	// yang telat datang tidak boleh menimpa hasil sesi yang sedang dilihat sekarang.
	const sesiIdBerjalanRef = React.useRef<string | null>(null);

	const sesiSelesai = sesi?.status === 'COMPLETED';
	const bolehMengevaluasi = izin.canRun && sesiSelesai;

	const jalankanEvaluasi = React.useCallback(async () => {
		if (!bolehMengevaluasi || !sesi) return;

		const sesiId = sesi.id;
		sesiIdBerjalanRef.current = sesiId;
		setStatus('berjalan');
		setPesanGagal(null);

		try {
			const nIndicators = Math.min(Math.max(sesi.totalIndicators, 1), 64);
			const evalId = await assessmentSessionRepository.runEval(sesiId, nIndicators);

			// eslint-disable-next-line no-constant-condition
			while (true) {
				if (sesiIdBerjalanRef.current !== sesiId) return; // sesi sudah berganti

				const hasil = await assessmentSessionRepository.findEvalResult(evalId);

				if (hasil.status === 'completed') {
					if (sesiIdBerjalanRef.current !== sesiId) return;
					if (!hasil.kualitas) {
						setStatus('gagal');
						setPesanGagal('Evaluasi selesai tapi hasilnya tidak lengkap — coba jalankan ulang.');
						return;
					}
					setKualitas(hasil.kualitas);
					setStatus('diam');
					return;
				}

				if (hasil.status === 'failed') {
					if (sesiIdBerjalanRef.current !== sesiId) return;
					setStatus('gagal');
					setPesanGagal(hasil.error ?? 'Evaluasi RAGAS gagal — coba jalankan ulang.');
					return;
				}

				await new Promise((resolve) => setTimeout(resolve, JEDA_POLL_MS));
			}
		} catch (error) {
			if (sesiIdBerjalanRef.current !== sesiId) return;
			setStatus('gagal');
			setPesanGagal(
				error instanceof Error
					? error.message
					: 'Gagal menjalankan evaluasi RAGAS.',
			);
		}
	}, [bolehMengevaluasi, sesi]);

	// Pindah sesi (atau sesi hilang) membatalkan polling yang sedang berjalan dan
	// mengembalikan panel ke keadaan diam, di-seed dari kualitas TERSIMPAN sesi
	// baru itu (bisa null = belum pernah dievaluasi) — bukan selalu null begitu
	// saja, supaya sesi yang sudah dievaluasi sebelumnya tetap menampilkan
	// hasilnya begitu dibuka lagi.
	//
	// Sengaja cuma bergantung ke `sesi?.id`, bukan `sesi?.kualitas` juga:
	// objeknya berganti referensi tiap `sesi` di-refetch (mis. polling status
	// lain berjalan bersamaan), dan mengikutkannya di sini akan mereset status
	// 'berjalan'/'gagal' ke 'diam' di tengah evaluasi yang justru sedang
	// dijalankan hook ini sendiri. Perubahan kualitas untuk sesi yang SAMA
	// selalu datang dari `jalankanEvaluasi` di bawah, bukan dari luar.
	React.useEffect(() => {
		sesiIdBerjalanRef.current = null;
		setKualitas(sesi?.kualitas ?? null);
		setStatus('diam');
		setPesanGagal(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sesi?.id]);

	return {
		kualitas,
		status,
		pesanGagal,
		bolehMengevaluasi,
		sesiSelesai,
		jalankanEvaluasi,
	};
}
