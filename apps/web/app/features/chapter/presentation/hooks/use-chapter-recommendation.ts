import * as React from 'react';

import { streamSse } from '~/core/lib/sse-client';
import {
	ambilJobTertunda,
	hapusJobTertunda,
	simpanJobTertunda,
} from '~/core/lib/pending-job-storage';
import { chapterRepository } from '../../data/repositories/chapter.repository';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type DocumentRecommendationEntity } from '../../domain/entities/document-recommendation.entity';
import { type ChapterPermission } from './use-chapter-permission';

/** Bentuk event `GET jobs/:id/events` untuk REKOMENDASI_DOKUMEN — lihat `job-events.service.ts::JobUpdate`. */
type JobEvent = {
	jobId: string;
	status: 'progress' | 'completed' | 'failed';
	result?: {
		status: 'completed' | 'error';
		recommendationId?: string;
		babDraftId?: string;
		error?: string;
	};
	error?: string;
};

export type StatusRekomendasi = 'diam' | 'berjalan' | 'gagal';

const JENIS_JOB = 'recommend';

/**
 * Alur "Rekomendasikan Dokumen -> Konfirmasi" (docs port origin/led-wiriting
 * (dimas)): sebelum bab digenerate, AI boleh disuruh menyarankan folder/dokumen
 * bukti dukung yang relevan; penyusun meninjau lalu mengonfirmasi bukti mana
 * yang benar-benar dipakai sebagai konteks generate.
 *
 * Sengaja terpisah dari `useChapterGeneration` — dua siklus hidup berbeda.
 * Generate menimpa `kontenKerja`; ini cuma menyiapkan konteks sebelum itu
 * terjadi, dan bab yang tidak pernah memicunya (`rekomendasi === null`) sama
 * sekali tidak terpengaruh — lihat gerbang di `chapter-generation-panel.tsx`.
 *
 * Polanya meniru persis `jalankanGenerate` di `useChapterGeneration`: producer
 * NestJS dipanggil, lalu `streamSse` menunggu job REKOMENDASI_DOKUMEN selesai —
 * bukan pola baru, satu-satunya job async lain yang sudah ada di tab ini.
 *
 * **Sengaja tidak memegang Set pilihan buktinya sendiri.** Daftar bukti dukung
 * dan centangnya sudah ada — persis di bawah blok ini, dipegang
 * `useChapterGeneration`'s `terpilih`. Menyalinnya ke sini berarti dua kotak
 * centang untuk satu berkas yang sama, atau dua Set yang harus dijaga selaras
 * tanpa mekanisme yang memaksanya. `konfirmasi()` sebagai gantinya menerima
 * pilihan itu sebagai argumen dari pemanggil (`chapter-generation-panel.tsx`).
 *
 * **Tersambung ulang setelah refresh.** Job id disimpan ke `sessionStorage`
 * (`pending-job-storage.ts`) begitu dipicu, dan dibaca ulang saat hook ini
 * mount — refresh di tengah AI mencari rekomendasi dulunya membuang seluruh
 * state "sedang berjalan" tanpa jejak walau job-nya sendiri tetap jalan di
 * worker, membuat penyusun mengira sistemnya berhenti. `jobs.gateway.ts`
 * sudah mengirim status TERKINI job begitu stream dibuka (`startWith`), jadi
 * yang perlu dilakukan di sini cuma menyambung ulang ke job id yang sama,
 * bukan memicu job baru.
 */
export function useChapterRecommendation({
	chapter,
	izin,
}: {
	chapter: ChapterEntity;
	izin: ChapterPermission;
}) {
	const [rekomendasi, setRekomendasi] =
		React.useState<DocumentRecommendationEntity | null>(null);
	const [status, setStatus] = React.useState<StatusRekomendasi>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	/**
	 * Checkpoint aktif berganti tiap kali alur ini dipicu — worker langsung
	 * menunjuk draft kosong barunya (lihat `worker.py::_handle_rekomendasi_dokumen`
	 * langkah 7) — begitu juga generate biasa yang membuat checkpoint sendiri.
	 * Rekomendasi lama tidak relevan lagi begitu checkpoint aktifnya berubah,
	 * jadi dibaca ulang setiap kali `checkpointAktifId` berubah, termasuk saat
	 * halaman baru dimuat di tengah alur (sebelum sempat dikonfirmasi).
	 */
	React.useEffect(() => {
		let dibatalkan = false;

		if (!chapter.checkpointAktifId) {
			setRekomendasi(null);
			return;
		}

		chapterRepository
			.findRecommendation(chapter.id, chapter.checkpointAktifId)
			.then((rec) => {
				if (!dibatalkan) setRekomendasi(rec);
			})
			.catch(() => {
				if (!dibatalkan) setRekomendasi(null);
			});

		return () => {
			dibatalkan = true;
		};
	}, [chapter.id, chapter.checkpointAktifId]);

	/** Menunggu satu job REKOMENDASI_DOKUMEN sampai kelar — dipakai baik saat
	 * baru dipicu maupun saat menyambung ulang ke job id lama dari sessionStorage. */
	const tunggu = React.useCallback(
		async (jobId: string) => {
			try {
				let hasilJob: JobEvent | null = null;
				for await (const event of streamSse<JobEvent>(`/jobs/${jobId}/events`)) {
					if (event.status === 'completed' || event.status === 'failed') {
						hasilJob = event;
						break;
					}
				}

				if (
					!hasilJob ||
					hasilJob.status === 'failed' ||
					hasilJob.result?.status === 'error'
				) {
					setStatus('gagal');
					setPesanGagal(
						hasilJob?.result?.error ??
							hasilJob?.error ??
							'Mencari rekomendasi dokumen gagal diselesaikan. Coba lagi.',
					);
					return;
				}

				const draftId = hasilJob.result?.babDraftId;
				const rec = draftId
					? await chapterRepository.findRecommendation(chapter.id, draftId)
					: null;

				setRekomendasi(rec);
				setStatus('diam');
			} catch {
				setStatus('gagal');
				setPesanGagal(
					'Mencari rekomendasi dokumen gagal diselesaikan. Periksa koneksi lalu coba lagi.',
				);
			} finally {
				hapusJobTertunda(chapter.id, JENIS_JOB);
			}
		},
		[chapter.id],
	);

	/** Sambung ulang ke job yang belum sempat selesai saat halaman ini
	 * dimuat/di-refresh — sekali per bab, bukan tiap render. */
	React.useEffect(() => {
		const jobId = ambilJobTertunda(chapter.id, JENIS_JOB);
		if (!jobId) return;

		setStatus('berjalan');
		setPesanGagal(null);
		void tunggu(jobId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chapter.id]);

	const trigger = React.useCallback(async () => {
		if (!izin.canEdit || status === 'berjalan') return;

		setStatus('berjalan');
		setPesanGagal(null);

		try {
			const job = await chapterRepository.triggerRecommendDocuments(chapter.id);
			simpanJobTertunda(chapter.id, JENIS_JOB, job.id);
			await tunggu(job.id);
		} catch {
			setStatus('gagal');
			setPesanGagal(
				'Mencari rekomendasi dokumen gagal diselesaikan. Periksa koneksi lalu coba lagi.',
			);
			hapusJobTertunda(chapter.id, JENIS_JOB);
		}
	}, [izin.canEdit, status, chapter.id, tunggu]);

	/**
	 * `DocumentRecommendation` yang sudah `DIKONFIRMASI` tidak bisa dikonfirmasi
	 * ulang (`bab-pipeline.service.ts::confirmRecommendation` menolaknya 403) —
	 * jadi tombolnya di `ChapterDocumentRecommendation` memang disembunyikan
	 * begitu status ini tercapai, bukan dibiarkan gagal diam-diam.
	 *
	 * `selectedEvidenceIds`: pilihan `terpilih` milik `useChapterGeneration`,
	 * dikirim apa adanya oleh pemanggil.
	 */
	const konfirmasi = React.useCallback(
		async (selectedEvidenceIds: string[]) => {
			if (!rekomendasi || rekomendasi.status !== 'DIREKOMENDASIKAN') return;

			await chapterRepository.confirmRecommendation(chapter.id, {
				recommendationId: rekomendasi.id,
				selectedEvidenceIds,
			});

			// Balikan `confirmRecommendation` tidak menyertakan `items` (lihat catatan
			// di repository) — status/pilihan baru ditulis langsung ke entity yang
			// sudah dipegang, bukan mengganti seluruhnya dengan hasil yang tidak lengkap.
			setRekomendasi((sebelumnya) =>
				sebelumnya
					? { ...sebelumnya, status: 'DIKONFIRMASI', selectedEvidenceIds }
					: sebelumnya,
			);
		},
		[rekomendasi, chapter.id],
	);

	return {
		/** `null` = belum pernah memicu alur ini untuk checkpoint aktif bab ini. */
		rekomendasi,
		status,
		pesanGagal,
		trigger,
		konfirmasi,
	};
}
