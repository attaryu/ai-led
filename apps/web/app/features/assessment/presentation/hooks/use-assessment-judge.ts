import * as React from 'react';

import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { type AssessmentSessionEntity } from '../../domain/entities/assessment-session.entity';
import {
	jumlahkanProgres,
	kunciSasaranJudge,
	pollJudge,
	ringkasJudge,
	type JudgeProgress,
} from '../utils/assessment-judge-poll';
import { type AssessmentPermission } from './use-assessment-permission';

export type StatusJudge = 'diam' | 'berjalan' | 'gagal';

/**
 * Satu run judge per sesi. `indikator` kosong/undefined = seluruh sesi (server melewati baris yang
 * sudah dijudge). Tampilan "terbaru" menggabungkan hasil dari beberapa sesi, jadi satu aksi
 * pengguna bisa berarti beberapa run berurutan.
 */
export type PermintaanJudge = {
	sesiId: string;
	indikator?: { indikatorNo: number; subNo: string }[];
}[];

/** Sasaran run judge TERAKHIR: `'sesi'` = "Judge semua", selain itu `kunciSasaranJudge(...)`, `null` = belum ada run. */
export type LingkupJudge = 'sesi' | string | null;

/** Jarak antar-poll — judge jalan di BackgroundTasks apps/ai, tidak ada SSE (sama seperti RAGAS). */
const JEDA_POLL_MS = 2000;

const PESAN_RESTART =
	'Layanan AI dimulai ulang saat judge berjalan; yang sudah selesai ditampilkan, ulangi untuk sisanya.';
const PESAN_MUAT_ULANG_GAGAL = 'Judge selesai, tetapi gagal memuat ulang hasil — muat ulang halaman.';

/**
 * Judge grounding on-demand (apps/ai `POST /assessment/:id/judge`, lewat proxy NestJS).
 *
 * Dipicu manual: satu indikator (tombol di laci) atau semua sesi yang tampil (`jalankan()` tanpa
 * argumen = sesi aktif). Hasilnya ditulis server ke `IndicatorResult.judgeVerdict`, jadi setelah
 * selesai cukup memuat ulang hasil (`muatUlang`). `confidence` tidak pernah diubah judge.
 *
 * Mengikuti `useAssessmentQuality`: hasil yang telat datang setelah sesi berganti tidak boleh
 * menimpa tampilan sesi yang sedang dilihat (`runIdRef`).
 */
export function useAssessmentJudge({
	sesi,
	izin,
	muatUlang,
}: {
	sesi: AssessmentSessionEntity | undefined;
	izin: AssessmentPermission;
	muatUlang: () => Promise<void>;
}) {
	const [status, setStatus] = React.useState<StatusJudge>('diam');
	const [progres, setProgres] = React.useState<JudgeProgress | null>(null);
	const [ringkasan, setRingkasan] = React.useState<string | null>(null);
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);
	const [lingkup, setLingkup] = React.useState<LingkupJudge>(null);
	const runIdRef = React.useRef(0);

	const sesiId = sesi?.id;
	// Judge hanya butuh baris yang sudah bernilai; run pada sesi yang masih hidup dijaga guard
	// stale-write di apps/ai. Karena itu tidak digerbang status sesi.
	const bolehMenjalankan = izin.canRun;

	// Sesi berganti: bersihkan sisa tampilan sesi sebelumnya dan hentikan polling lamanya.
	React.useEffect(() => {
		runIdRef.current += 1;
		setStatus('diam');
		setProgres(null);
		setRingkasan(null);
		setPesanGagal(null);
		setLingkup(null);
	}, [sesiId]);

	const jalankan = React.useCallback(
		async (permintaan?: PermintaanJudge) => {
			const daftar: PermintaanJudge = permintaan ?? (sesiId ? [{ sesiId }] : []);
			if (!bolehMenjalankan || daftar.length === 0) return;

			runIdRef.current += 1;
			const runId = runIdRef.current;
			const masihBerlaku = () => runIdRef.current === runId;

			const tunggal = daftar.length === 1 && daftar[0].indikator?.length === 1 ? daftar[0] : null;
			setLingkup(
				tunggal
					? kunciSasaranJudge(tunggal.sesiId, tunggal.indikator![0].indikatorNo, tunggal.indikator![0].subNo)
					: 'sesi',
			);
			setStatus('berjalan');
			setProgres(null);
			setRingkasan(null);
			setPesanGagal(null);

			let akumulasi: JudgeProgress = { total: 0, done: 0, skipped: 0, failed: 0 };
			let adaRestart = false;

			try {
				for (const { sesiId: sesiTujuan, indikator } of daftar) {
					const { judgeId, total, skipped } = await assessmentSessionRepository.runJudge(
						sesiTujuan,
						indikator,
					);
					if (!masihBerlaku()) return;

					if (total === 0) {
						// Tidak ada yang bisa dijudge (mis. sesi lama) — selesai seketika, tanpa polling.
						akumulasi = jumlahkanProgres(akumulasi, { total: 0, done: 0, skipped, failed: 0 });
						setProgres(akumulasi);
						continue;
					}

					const dasar = akumulasi;
					const hasil = await pollJudge({
						cek: () => assessmentSessionRepository.findJudgeStatus(judgeId),
						masihBerlaku,
						tidur: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
						jedaMs: JEDA_POLL_MS,
						onProgres: (p) => {
							if (masihBerlaku()) setProgres(jumlahkanProgres(dasar, p));
						},
					});

					if (hasil.kind === 'dibatalkan' || !masihBerlaku()) return;

					if (hasil.kind === 'gagal') {
						setStatus('gagal');
						setPesanGagal(hasil.pesan);
						return;
					}

					// 'selesai' maupun 'hilang' (apps/ai restart): verdict yang sudah ditulis ada di Postgres.
					if (hasil.kind === 'hilang') adaRestart = true;
					akumulasi = jumlahkanProgres(dasar, hasil.progres);
					setProgres(akumulasi);
				}
			} catch (error) {
				if (!masihBerlaku()) return;
				setStatus('gagal');
				setPesanGagal(error instanceof Error ? error.message : 'Gagal menjalankan judge.');
				return;
			}

			// Kegagalan memuat ulang BUKAN kegagalan judge: jangan mengundang ulang run berbayar.
			const teks = adaRestart ? PESAN_RESTART : ringkasJudge(akumulasi);
			let teksAkhir = teks;
			try {
				await muatUlang();
			} catch {
				teksAkhir = `${teks}. ${PESAN_MUAT_ULANG_GAGAL}`;
			}
			if (!masihBerlaku()) return;
			setRingkasan(teksAkhir);
			setStatus('diam');
		},
		[bolehMenjalankan, sesiId, muatUlang],
	);

	return { status, progres, ringkasan, pesanGagal, lingkup, bolehMenjalankan, jalankan };
}
