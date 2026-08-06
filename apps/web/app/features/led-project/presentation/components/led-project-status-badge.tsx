import { cn } from '~/core/lib/utils';
import { type LedProjectStatus } from '../../domain/entities/led-project.entity';

const statusStyles: Record<LedProjectStatus, string> = {
	DRAFT:
		'bg-slate-100 text-slate-800 border-slate-200/50 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800/30',
	REVIEW:
		'bg-amber-100 text-amber-800 border-amber-200/50 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/30',
	SELESAI:
		'bg-emerald-100 text-emerald-800 border-emerald-200/50 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/30',
};

/**
 * `DOKUMEN_LED.status_keseluruhan` (§14). Satu tempat untuk warnanya karena
 * status yang sama muncul di tabel lintas prodi, kartu Dashboard Prodi, dan
 * Dashboard Project LED.
 */
export function LedProjectStatusBadge({
	status,
	className,
}: {
	status: LedProjectStatus;
	className?: string;
}) {
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
				statusStyles[status],
				className,
			)}
		>
			{status}
		</span>
	);
}
