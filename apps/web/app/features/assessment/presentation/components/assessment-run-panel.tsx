import {
	PlayIcon,
	SpinnerGapIcon,
	StopIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Card, CardContent } from '~/core/components/ui/card';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import {
	assessmentStatusLabels,
	type AssessmentSessionEntity,
} from '../../domain/entities/assessment-session.entity';
import { type StatusPenilaian } from '../hooks/use-assessment-session';

/**
 * Tombol jalankan beserta progresnya.
 *
 * Prototipe memisahkan keduanya jadi dua kartu bertumpuk ("5. Mulai Penilaian"
 * lalu "Progres Penilaian") yang salah satunya selalu kosong. Di sini satu
 * kartu: tombolnya berubah jadi bilah progres saat berjalan, karena keduanya
 * memang menjawab pertanyaan yang sama pada dua waktu yang berbeda.
 */
export function AssessmentRunPanel({
	sesi,
	status,
	progresLive,
	pesanGagal,
	siap,
	bolehMenjalankan,
	melihatSesiTerbaru,
	onJalankan,
	onBatalkan,
	membatalkan,
}: {
	sesi: AssessmentSessionEntity | undefined;
	status: StatusPenilaian;
	/** Progres mentah dari SSE, dari `useAssessmentSession` — satu-satunya
	 * sumber progres yang ada pada RUN PERTAMA untuk dokumen ini, sebelum
	 * baris `AssessmentSession` manapun ada untuk ditumpangi `sesi`. Tanpa
	 * ini, klik "Mulai Penilaian Otomatis" terasa tidak berbuat apa-apa
	 * sampai halaman di-refresh (baru saat itu `sesi` terisi dari server). */
	progresLive: { completed: number; total: number } | null;
	pesanGagal: string | null;
	siap: boolean;
	bolehMenjalankan: boolean;
	melihatSesiTerbaru: boolean;
	onJalankan: () => void;
	/** AI-nya berat (satu indikator = satu pemanggilan LLM, puluhan detik) —
	 * kalau kepilih terlalu banyak atau salah pilih, pengguna perlu bisa
	 * berhenti tanpa menunggu semuanya selesai. */
	onBatalkan: () => void;
	/** Batalkan sudah diklik, menunggu worker benar-benar berhenti. */
	membatalkan: boolean;
}) {
	const lokalBerjalan = status === 'berjalan';
	const berjalan = lokalBerjalan || sesi?.status === 'RUNNING';
	/**
	 * Selagi HOOK INI sendiri yang mengemudikan run (baru dipicu, atau
	 * disambung ulang lewat sessionStorage — lihat use-assessment-session.ts),
	 * progresnya HARUS dari `progresLive` saja, tidak pernah `sesi`. `sesi`
	 * berasal dari `daftarSesi[0]` (polling biasa) yang baru ikut memuat sesi
	 * BARU ini setelah `muat()` berikutnya — sebelum itu ia masih menunjuk
	 * sesi LAMA yang sudah selesai, dan menumpanginya bikin bar sempat
	 * menampilkan angka sesi yang sama sekali tidak terkait dengan run yang
	 * baru saja diklik. Baru begitu run ini sendiri usai (`lokalBerjalan`
	 * jadi false), `sesi` boleh dipakai lagi (kini sudah pasti sinkron).
	 *
	 * Di luar itu (`sesi?.status === 'RUNNING'` tapi hook ini TIDAK sedang
	 * mengemudikannya — run dari tab/pengguna lain) angka `sesi` yang terakhir
	 * diketahui tetap lebih baik daripada tidak menampilkan apa-apa.
	 */
	const progres = lokalBerjalan
		? progresLive
		: sesi
			? { completed: sesi.completedIndicators, total: sesi.totalIndicators }
			: progresLive;
	const persen =
		progres && progres.total > 0
			? Math.round((progres.completed / progres.total) * 100)
			: 0;

	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-3">
				{berjalan ? (
					<>
						<div className="flex items-baseline justify-between gap-2">
							<p className="flex items-center gap-2 text-sm font-medium">
								<SpinnerGapIcon className="size-4 animate-spin" />
								Menilai indikator…
							</p>
							<div className="flex items-center gap-3">
								{/* Belum ada angka sama sekali di detik-detik pertama (job
								 * BullMQ belum sempat kirim event `progress` pertama) —
								 * spinner+label saja, tanpa "0/0" yang menyesatkan. */}
								{progres && (
									<p className="text-sm font-semibold tabular-nums">
										{progres.completed}
										<span className="font-normal text-muted-foreground">
											/{progres.total}
										</span>
									</p>
								)}
								{bolehMenjalankan && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={onBatalkan}
										disabled={membatalkan}
										className="cursor-pointer"
									>
										<StopIcon />
										{membatalkan ? 'Membatalkan…' : 'Batalkan'}
									</Button>
								)}
							</div>
						</div>

						<div
							role="progressbar"
							aria-label="Progres penilaian"
							aria-valuenow={persen}
							aria-valuemin={0}
							aria-valuemax={100}
							className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
						>
							<div
								className={
									progres
										? 'h-full rounded-full bg-primary transition-[width]'
										: 'h-full w-1/3 animate-pulse rounded-full bg-primary'
								}
								style={progres ? { width: `${persen}%` } : undefined}
							/>
						</div>
					</>
				) : (
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="min-w-0">
							{sesi ? (
								<>
									<p className="text-sm font-medium">
										{assessmentStatusLabels[sesi.status]} ·{' '}
										{sesi.completedIndicators} dari {sesi.totalIndicators}{' '}
										indikator
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{sesi.dijalankanOlehNama} ·{' '}
										{formatRelativeTimeLong(sesi.createdAt)}
									</p>
								</>
							) : (
								<p className="text-sm text-muted-foreground">
									Dokumen ini belum pernah dinilai.
								</p>
							)}
						</div>

						{/*
						 * §1: yang tidak boleh diakses disembunyikan, bukan dimatikan —
						 * Pimpinan tidak melihat tombol ini sama sekali. Yang dimatikan
						 * hanya keadaan yang bisa diperbaiki pengguna sendiri (bahan belum
						 * lengkap), dan alasannya tertulis di kartu tepat di atasnya.
						 */}
						{bolehMenjalankan && (
							<Button
								type="button"
								onClick={onJalankan}
								disabled={!siap}
								className="shrink-0 cursor-pointer"
							>
								<PlayIcon />
								{sesi ? 'Nilai Ulang' : 'Mulai Penilaian Otomatis'}
							</Button>
						)}
					</div>
				)}

				{/*
				 * Sesi lama yang dibuka dari Riwayat tetap menampilkan tombolnya, tapi
				 * pembacanya perlu tahu bahwa menekannya membuat sesi **baru** — bukan
				 * menilai ulang sesi yang sedang dilihat. Tanpa kalimat ini, tombol
				 * "Nilai Ulang" di atas hasil bulan lalu terbaca seolah akan menimpanya.
				 */}
				{!berjalan && sesi && !melihatSesiTerbaru && (
					<p className="text-xs leading-relaxed text-muted-foreground">
						Anda sedang melihat sesi lama. Menjalankan penilaian akan membuat
						sesi baru — hasil ini tetap tersimpan di Riwayat.
					</p>
				)}

				{pesanGagal && (
					<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
						<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
						<p className="text-xs leading-relaxed text-destructive">
							{pesanGagal}
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
