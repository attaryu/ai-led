import {
	CheckCircleIcon,
	ClockIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
	type Icon,
} from '@phosphor-icons/react';

import { cn } from '~/core/lib/utils';
import { type EvidenceStatus } from '../../domain/entities/evidence.entity';

const statusVisual: Record<
	EvidenceStatus,
	{ label: string; icon: Icon; className: string; spin?: boolean }
> = {
	MENUNGGU: {
		label: 'Menunggu',
		icon: ClockIcon,
		className:
			'bg-slate-100 text-slate-800 border-slate-200/50 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800/30',
	},
	DIPROSES: {
		label: 'Diproses',
		icon: SpinnerGapIcon,
		className:
			'bg-amber-100 text-amber-800 border-amber-200/50 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/30',
		spin: true,
	},
	SIAP: {
		label: 'Siap',
		icon: CheckCircleIcon,
		className:
			'bg-emerald-100 text-emerald-800 border-emerald-200/50 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/30',
	},
	GAGAL: {
		label: 'Gagal',
		icon: WarningCircleIcon,
		className:
			'bg-red-100 text-red-800 border-red-200/50 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/30',
	},
};

/**
 * Status pipeline ekstraksi (PRD §3.3). Berkas baru bisa dipakai sebagai
 * konteks AI setelah berstatus Siap, jadi statusnya sengaja ditampilkan
 * menonjol di tiap kartu dan baris, bukan disembunyikan di detail.
 */
export function EvidenceStatusBadge({
	status,
	className,
}: {
	status: EvidenceStatus;
	className?: string;
}) {
	const visual = statusVisual[status];
	const StatusIcon = visual.icon;

	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
				visual.className,
				className,
			)}
		>
			<StatusIcon className={cn('size-3.5', visual.spin && 'animate-spin')} />
			{visual.label}
		</span>
	);
}
