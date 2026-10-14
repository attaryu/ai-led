import { CheckIcon, SpinnerGapIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { type JudgeVerdictEntity } from '../../domain/entities/indicator-result.entity';
import { type StatusJudge } from '../hooks/use-assessment-judge';

/**
 * Hasil judge untuk satu indikator, di bawah "Justifikasi AI".
 *
 * **Bukan ukuran ketepatan skor.** Judge hanya memeriksa apakah klaim dalam justifikasi didukung
 * bukti yang diambil penilai; skor bisa tetap keliru walau "Didukung bukti". Kalimat bantuan di
 * bawah sengaja mengatakannya, sama alasannya dengan keterangan badge keyakinan.
 *
 * Tidak ada pembeda sesi lama: semua baris tanpa verdict tampil "Belum dijudge". Untuk sesi lama
 * (bukti tidak tersimpan) menekan tombol hanya menghasilkan ringkasan "dilewati".
 */
export function AssessmentJudgePanel({
	judge,
	bolehMenjalankan,
	sedangBerjalan,
	onJalankan,
	status,
	ringkasan,
	pesanGagal,
}: {
	judge: JudgeVerdictEntity | null;
	bolehMenjalankan: boolean;
	/** Judge (indikator ini atau seluruh sesi) sedang berjalan; tombol dikunci. */
	sedangBerjalan: boolean;
	onJalankan: () => void;
	/**
	 * Hasil run judge terakhir, diulang di sini karena bar di daftar tertutup backdrop laci:
	 * tanpa baris ini, hasil "dilewati"/gagal/restart tidak terlihat di tempat tombol ditekan.
	 */
	status: StatusJudge;
	ringkasan: string | null;
	pesanGagal: string | null;
}) {
	const pesan =
		status === 'gagal' && pesanGagal
			? { teks: pesanGagal, gagal: true }
			: status !== 'berjalan' && ringkasan
				? { teks: ringkasan, gagal: false }
				: null;

	return (
		<div className="rounded-md border border-border p-2.5">
			<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
				<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					Dukungan bukti (Judge)
				</p>
				{bolehMenjalankan && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onJalankan}
						disabled={sedangBerjalan}
						className="cursor-pointer"
					>
						{sedangBerjalan && <SpinnerGapIcon className="animate-spin" />}
						{judge ? 'Jalankan ulang' : 'Jalankan Judge'}
					</Button>
				)}
			</div>

			<div aria-live="polite">
				{pesan && (
					<p
						className={
							pesan.gagal
								? 'mt-1 flex items-center gap-1 text-xs text-destructive'
								: 'mt-1 text-xs text-muted-foreground'
						}
					>
						{pesan.gagal && <WarningCircleIcon className="size-3.5" />}
						{pesan.teks}
					</p>
				)}
			</div>

			{judge === null ? (
				<p className="mt-1 text-sm text-muted-foreground">Belum dijudge.</p>
			) : (
				<div className="mt-1 space-y-2 text-sm">
					<p className="flex items-center gap-1.5 font-medium">
						{judge.grounded ? (
							<>
								<CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
								Didukung bukti
							</>
						) : (
							<>
								<WarningCircleIcon className="size-4 text-amber-600 dark:text-amber-400" />
								Tidak sepenuhnya didukung bukti
							</>
						)}
					</p>

					{judge.klaimTakTerdukung.length > 0 && (
						<div>
							<p className="text-xs font-medium text-muted-foreground">Klaim yang tidak didukung bukti</p>
							<ul className="mt-0.5 list-disc pl-5">
								{judge.klaimTakTerdukung.map((klaim) => (
									<li key={klaim}>{klaim}</li>
								))}
							</ul>
						</div>
					)}

					{judge.faktaTerlewat.length > 0 && (
						<div>
							<p className="text-xs font-medium text-muted-foreground">Ada di bukti tetapi tidak disebut</p>
							<ul className="mt-0.5 list-disc pl-5">
								{judge.faktaTerlewat.map((fakta) => (
									<li key={fakta}>{fakta}</li>
								))}
							</ul>
						</div>
					)}

					{judge.catatan && <p className="leading-relaxed">{judge.catatan}</p>}

					<p className="text-xs text-muted-foreground">
						{[judge.model, judge.dinilaiPada ? formatRelativeTimeLong(judge.dinilaiPada) : null]
							.filter(Boolean)
							.join(' · ')}
					</p>
				</div>
			)}

			<p className="mt-2 text-xs text-muted-foreground">
				Pemeriksaan independen apakah klaim dalam justifikasi didukung bukti yang diambil AI. Bukan
				ukuran ketepatan skor.
			</p>
		</div>
	);
}
