import { Link } from 'react-router';

import { cn } from '~/core/lib/utils';
import { type AssessmentOverviewEntity } from '../../domain/entities/assessment-overview.entity';

export const SKOR_MAKS = 4;

export const formatSkor = (nilai: number) =>
	nilai.toLocaleString('id-ID', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

/**
 * Ringkasan penilaian AMI terbaru satu dokumen untuk sel tabel dashboard.
 * Selama sesi terbaru belum COMPLETED ia hanya memuat satu kalimat keadaannya.
 *
 * `overview = null` berarti dokumen belum pernah dinilai.
 */
export function AssessmentOverviewSummary({
	overview,
	assessmentHref,
}: {
	overview: AssessmentOverviewEntity | null;
	assessmentHref: string;
}) {
	const sesi = overview?.sesi ?? null;

	if (!overview || !sesi) {
		return (
			<span className="text-sm whitespace-nowrap text-muted-foreground">
				Belum dinilai
			</span>
		);
	}

	if (sesi.status !== 'COMPLETED') {
		const label =
			sesi.status === 'RUNNING'
				? `Sedang berjalan ${sesi.completedIndicators}/${sesi.totalIndicators}`
				: sesi.status === 'FAILED'
					? 'Gagal'
					: 'Dibatalkan';
		return (
			<Link
				to={assessmentHref}
				className={cn(
					'text-sm whitespace-nowrap tabular-nums hover:underline',
					sesi.status === 'RUNNING'
						? 'text-sky-700 dark:text-sky-400'
						: sesi.status === 'FAILED'
							? 'text-destructive'
							: 'text-muted-foreground',
				)}
			>
				{label}
			</Link>
		);
	}

	const persen =
		sesi.totalIndicators === 0
			? 0
			: Math.min(100, (overview.ditinjau / sesi.totalIndicators) * 100);

	return (
		<Link
			to={assessmentHref}
			className="flex min-w-24 flex-col gap-2 hover:underline"
		>
			<span className="text-xs whitespace-nowrap tabular-nums text-muted-foreground">
				Skor rata-rata:{' '}
				{overview.skorRataRata !== null ? (
					<span className="font-semibold text-foreground">
						{formatSkor(overview.skorRataRata)} / {SKOR_MAKS}
					</span>
				) : (
					'—'
				)}
			</span>

			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20">
				<div
					className="h-full rounded-full bg-emerald-500"
					style={{ width: `${persen}%` }}
				/>
			</div>
			<span className="text-xs tabular-nums whitespace-nowrap text-muted-foreground">
				{overview.ditinjau} dari {sesi.totalIndicators} indikator
			</span>
		</Link>
	);
}
