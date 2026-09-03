import * as React from 'react';

import { streamSse } from '~/core/lib/sse-client';
import {
	ambilJobTertunda,
	hapusJobTertunda,
	simpanJobTertunda,
} from '~/core/lib/pending-job-storage';
import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { type AssessmentSessionEntity } from '../../domain/entities/assessment-session.entity';
import { type AssessmentSource } from '../../domain/entities/assessment-source.entity';
import { type AssessmentPermission } from './use-assessment-permission';

export type StatusPenilaian = 'diam' | 'berjalan' | 'gagal';

const JENIS_JOB = 'assessment';

/** Bentuk event `GET jobs/:id/events` — sama dengan `use-chapter-generation.ts`.
 * `progress` di sini objek `{completed, total}` (worker.py::_handle_assessment_ami). */
type JobEvent = {
	jobId: string;
	status: 'progress' | 'completed' | 'failed';
	progress?: unknown;
	/** `cancelled` — tombol Batalkan berhasil, BUKAN kegagalan (job BullMQ-nya
	 * sendiri tetap `completed`, cuma isinya beda; lihat worker.py). */
	result?: {
		status: 'completed' | 'error' | 'cancelled';
		sessionId?: string;
		error?: string;
	};
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
 *
 * **Tersambung ulang setelah refresh**, sama seperti
 * `use-chapter-recommendation.ts` — job id disimpan ke `sessionStorage`
 * begitu dipicu, dibaca ulang saat hook ini mount. Tanpa ini progres live
 * (`progresLive`) dan tombol Batalkan cuma berfungsi selama tab yang memicu
 * run tetap terbuka; refresh di tengah run yang 64-indikator (bisa bermenit-
 * menit) bikin progress bar-nya membeku di angka terakhir sebelum refresh
 * dan tombol Batalkan diam-diam tidak berbuat apa-apa (tidak ada `jobId`
 * yang bisa ditarget) — persis kelas bug yang sama yang sudah dibereskan di
 * fitur rekomendasi dokumen.
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
	/** Job yang sedang dipantau SSE — target tombol Batalkan. Diisi baik saat
	 * `jalankan()` sendiri yang memicu, maupun saat mount menemukan job
	 * tertunda dari sessionStorage (lihat efek resume di bawah). */
	const jobIdBerjalan = React.useRef<string | null>(null);
	const [membatalkan, setMembatalkan] = React.useState(false);

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

	/** Menunggu satu job ASSESSMENT_AMI sampai kelar — dipakai baik saat baru
	 * dipicu (`jalankan`) maupun saat menyambung ulang ke job id lama dari
	 * sessionStorage setelah refresh. */
	const tunggu = React.useCallback(
		async (jobId: string) => {
			jobIdBerjalan.current = jobId;
			try {
				let hasilJob: JobEvent | null = null;
				for await (const event of streamSse<JobEvent>(`/jobs/${jobId}/events`)) {
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

				// `cancelled` mendarat di sini juga (bukan cabang gagal di atas) —
				// dibatalkan lewat tombol sendiri bukan kegagalan. Sesi yang baru
				// di-`muat()` di atas sudah membawa status CANCELLED-nya sendiri
				// buat ditampilkan (assessmentStatusLabels).
				setStatus('diam');
				// Bersihkan pesan gagal-membatalkan yang mungkin masih nempel dari
				// klik Batalkan yang sempat gagal (lihat `batalkan`) — run ini
				// sendiri sudah beres, pesan lama itu sudah tidak relevan.
				setPesanGagal(null);
			} catch {
				setStatus('gagal');
				setPesanGagal(
					'Penilaian gagal diselesaikan. Periksa koneksi lalu jalankan ulang.',
				);
			} finally {
				setProgresLive(null);
				jobIdBerjalan.current = null;
				setMembatalkan(false);
				hapusJobTertunda(projectId, JENIS_JOB);
			}
		},
		[projectId, muat],
	);

	/** Sambung ulang ke job yang belum sempat selesai saat halaman ini
	 * dimuat/di-refresh — sekali per dokumen, bukan tiap render. */
	React.useEffect(() => {
		const jobId = ambilJobTertunda(projectId, JENIS_JOB);
		if (!jobId) return;

		setStatus('berjalan');
		setPesanGagal(null);
		void tunggu(jobId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectId]);

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
				simpanJobTertunda(projectId, JENIS_JOB, job.id);
				// Sesi barunya baru tercatat di Postgres begitu worker mulai
				// memprosesnya (create_session di dalam _handle_assessment_ami),
				// bukan seketika trigger ini selesai. Tanpa muat() di sini,
				// `daftarSesi[0]` masih sesi LAMA sampai `tunggu()` di bawah
				// selesai (baru muat() lagi di situ) — progress bar bisa sempat
				// menumpangi angka sesi lama yang tidak terkait sebelum event
				// SSE progress pertama tiba dan progresLive menimpanya.
				await muat();
				await tunggu(job.id);
			} catch {
				setStatus('gagal');
				setPesanGagal(
					'Penilaian gagal diselesaikan. Periksa koneksi lalu jalankan ulang.',
				);
				hapusJobTertunda(projectId, JENIS_JOB);
			}
		},
		[izin.canRun, status, projectId, tunggu],
	);

	/** Tombol Batalkan di progress bar — minta job berhenti, lalu tunggu
	 * `tunggu()`'s SSE loop sendiri yang menerima event terminal `cancelled`
	 * dan membereskan status. Tidak mengubah `status` di sini supaya progress
	 * bar tidak berkedip balik ke keadaan diam sebelum workernya sungguhan
	 * berhenti.
	 *
	 * Job id-nya diutamakan dari `sesiAktif.jobId` (kolom Postgres,
	 * `AssessmentSession.bullJobId`) — itu yang membuat tombol ini bekerja
	 * dari tab/pengguna MANAPUN yang sedang melihat sesi RUNNING, bukan cuma
	 * tab yang memulainya. `jobIdBerjalan.current` (ref lokal) cuma jadi
	 * fallback buat jendela singkat tepat setelah `jalankan()` memicu job,
	 * sebelum `muat()` sempat membawa `bullJobId`-nya masuk ke `sesiAktif`. */
	const batalkan = React.useCallback(async () => {
		if (membatalkan) return;
		const jobId = sesiAktif?.jobId ?? jobIdBerjalan.current;
		if (!jobId) {
			// Sesi lama dari sebelum kolom `bullJobId` ada, atau lewat rute HTTP
			// langsung apps/ai — tidak ada job buat ditarget sama sekali. Beri
			// tahu, jangan diam-diam tidak berbuat apa-apa (persis bug yang
			// dulu terjadi lewat `jobIdBerjalan.current` doang).
			setPesanGagal(
				'Sesi ini tidak bisa dibatalkan dari sini — tidak ada job yang tercatat untuknya.',
			);
			return;
		}
		setMembatalkan(true);
		try {
			await assessmentSessionRepository.cancel(jobId);
		} catch {
			setMembatalkan(false);
			setPesanGagal('Gagal membatalkan penilaian. Coba lagi.');
		}
	}, [membatalkan, sesiAktif]);

	return {
		daftarSesi,
		sesiAktif,
		/** Progres mentah dari SSE — dipakai `AssessmentRunPanel` saat run
		 * PERTAMA untuk dokumen ini, ketika belum ada `sesiAktif` sama sekali
		 * untuk ditumpangi (lihat komentar di atas `sesiAktif`). */
		progresLive,
		melihatSesiTerbaru,
		status,
		pesanGagal,
		jalankan,
		batalkan,
		/** Batalkan sudah diminta, menunggu worker berhenti — dipakai
		 * `AssessmentRunPanel` buat menonaktifkan tombolnya sekali klik. */
		membatalkan,
	};
}
