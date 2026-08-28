import * as React from 'react';

import { streamSse } from '~/core/lib/sse-client';
import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { type AssessmentSessionEntity } from '../../domain/entities/assessment-session.entity';
import { type AssessmentSource } from '../../domain/entities/assessment-source.entity';
import { type AssessmentPermission } from './use-assessment-permission';

export type StatusPenilaian = 'diam' | 'berjalan' | 'gagal';

/** Bentuk event `GET jobs/:id/events` — sama dengan `use-chapter-generation.ts`.
 * `progress` di sini objek `{completed, total}` (worker.py::_handle_assessment_ami). */
type JobEvent = {
	jobId: string;
	status: 'progress' | 'completed' | 'failed';
	progress?: unknown;
	result?: { status: 'completed' | 'error'; sessionId?: string; error?: string };
	error?: string;
};

function isProgressPayload(
	value: unknown,
): value is { completed: number; total: number } {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { completed?: unknown }).completed === 'number' &&
		typeof (value as { total?: unknown }).total === 'number'
	);
}

/**
 * Daftar sesi penilaian satu dokumen, sesi yang sedang dilihat, dan penjalanan
 * penilaian itu sendiri — dipicu lewat job BullMQ (ASSESSMENT_AMI) sungguhan,
 * mengikuti pola `useChapterGeneration`.
 *
 * Sesi yang dilihat hidup di URL (`?sesi=`), bukan di state: membuka satu baris
 * riwayat harus menghasilkan tautan yang bisa dikirim ke orang lain.
 */
export function useAssessmentSession({
	projectId,
	sesiIdTerpilih,
	izin,
}: {
	projectId: string;
	/** Dari `?sesi=`; `null` berarti sesi terbaru. */
	sesiIdTerpilih: string | null;
	izin: AssessmentPermission;
}) {
	const [daftarSesi, setDaftarSesi] = React.useState<AssessmentSessionEntity[]>(
		[],
	);
	const [status, setStatus] = React.useState<StatusPenilaian>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);
	/** Progres live dari SSE selagi job berjalan — ditumpangkan ke sesi yang
	 * sedang dilihat supaya bar bergerak tanpa menunggu polling ulang. */
	const [progresLive, setProgresLive] = React.useState<{
		completed: number;
		total: number;
	} | null>(null);

	const muat = React.useCallback(async () => {
		try {
			setDaftarSesi(await assessmentSessionRepository.findByDokumenId(projectId));
		} catch {
			setDaftarSesi([]);
		}
	}, [projectId]);

	React.useEffect(() => {
		void muat();
	}, [muat]);

	const sesiMentah =
		daftarSesi.find((sesi) => sesi.id === sesiIdTerpilih) ?? daftarSesi[0];

	const sesiAktif: AssessmentSessionEntity | undefined =
		sesiMentah && progresLive && status === 'berjalan'
			? {
					...sesiMentah,
					completedIndicators: progresLive.completed,
					totalIndicators: progresLive.total,
					status: 'RUNNING',
				}
			: sesiMentah;

	/** Sesi terbaru yang sedang dilihat — hanya itu yang boleh dinilai ulang. */
	const melihatSesiTerbaru =
		sesiAktif !== undefined && sesiAktif.id === daftarSesi[0]?.id;

	const jalankan = React.useCallback(
		async (sumber: AssessmentSource, indikatorList?: number[]) => {
			if (!izin.canRun || status === 'berjalan') return;

			setStatus('berjalan');
			setPesanGagal(null);
			setProgresLive(null);

			try {
				const job = await assessmentSessionRepository.trigger(projectId, {
					indikatorList,
					sumberLed: sumber.sumberLed,
					ledFileName: sumber.ledFileName ?? undefined,
					lkpsBuktiDukungId: sumber.lkpsBuktiDukungId ?? undefined,
					laporanBuktiDukungId: sumber.laporanBuktiDukungId ?? undefined,
				});

				let hasilJob: JobEvent | null = null;
				for await (const event of streamSse<JobEvent>(`/jobs/${job.id}/events`)) {
					if (event.status === 'progress' && isProgressPayload(event.progress)) {
						setProgresLive(event.progress);
					}
					if (event.status === 'completed' || event.status === 'failed') {
						hasilJob = event;
						break;
					}
				}

				await muat();

				if (
					!hasilJob ||
					hasilJob.status === 'failed' ||
					hasilJob.result?.status === 'error'
				) {
					setStatus('gagal');
					setPesanGagal(
						hasilJob?.result?.error ??
							hasilJob?.error ??
							'Penilaian gagal diselesaikan. Periksa koneksi lalu jalankan ulang.',
					);
					return;
				}

				setStatus('diam');
			} catch {
				setStatus('gagal');
				setPesanGagal(
					'Penilaian gagal diselesaikan. Periksa koneksi lalu jalankan ulang.',
				);
			} finally {
				setProgresLive(null);
			}
		},
		[izin.canRun, status, projectId, muat],
	);

	return {
		daftarSesi,
		sesiAktif,
		melihatSesiTerbaru,
		status,
		pesanGagal,
		jalankan,
	};
}
