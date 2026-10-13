import { SpinnerGapIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { type StatusJudge } from '../hooks/use-assessment-judge';
import { type JudgeProgress } from '../utils/assessment-judge-poll';

/**
 * Judge untuk seluruh sesi, di atas daftar hasil. Baris yang sudah dijudge dilewati (tidak
 * dibayar ulang); menjalankan ulang satu indikator dilakukan dari laci.
 */
export function AssessmentJudgeBar({
	status,
	progres,
	ringkasan,
	pesanGagal,
	onJalankan,
}: {
	status: StatusJudge;
	progres: JudgeProgress | null;
	ringkasan: string | null;
	pesanGagal: string | null;
	onJalankan: () => void;
}) {
	const berjalan = status === 'berjalan';

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border p-2.5">
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium">Periksa dukungan bukti (Judge)</p>
				<p className="text-xs text-muted-foreground" aria-live="polite">
					{berjalan
						? progres
							? `Memeriksa… ${progres.done}/${progres.total}${progres.skipped > 0 ? ` · ${progres.skipped} dilewati` : ''}`
							: 'Memulai…'
						: (ringkasan ??
							'Memeriksa apakah klaim justifikasi didukung bukti yang diambil AI. Tidak mengubah skor maupun keyakinan.')}
				</p>
				{status === 'gagal' && pesanGagal && (
					<p className="mt-1 flex items-center gap-1 text-xs text-destructive">
						<WarningCircleIcon className="size-3.5" />
						{pesanGagal}
					</p>
				)}
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={onJalankan}
				disabled={berjalan}
				className="cursor-pointer"
			>
				{berjalan && <SpinnerGapIcon className="animate-spin" />}
				Judge semua
			</Button>
		</div>
	);
}
