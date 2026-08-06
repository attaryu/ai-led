import {
	CircleDashedIcon,
	LockSimpleIcon,
	PencilSimpleLineIcon,
	type Icon,
} from '@phosphor-icons/react';

import { cn } from '~/core/lib/utils';
import { type ChapterProgress } from '~/features/chapter/domain/entities/chapter.entity';

const progressVisual: Record<
	ChapterProgress,
	{ label: string; icon: Icon; className: string }
> = {
	BELUM_DIISI: {
		label: 'Belum diisi',
		icon: CircleDashedIcon,
		className:
			'bg-slate-100 text-slate-800 border-slate-200/50 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800/30',
	},
	SEDANG_DISUSUN: {
		label: 'Sedang disusun',
		icon: PencilSimpleLineIcon,
		className:
			'bg-amber-100 text-amber-800 border-amber-200/50 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/30',
	},
	TERKUNCI: {
		label: 'Terkunci',
		icon: LockSimpleIcon,
		className:
			'bg-emerald-100 text-emerald-800 border-emerald-200/50 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/30',
	},
};

/**
 * Status bab yang **diturunkan**, bukan disimpan (docs/application_flow.md
 * §6.1a). Bentuknya sengaja disamakan dengan `EvidenceStatusBadge` supaya kedua
 * jenis status di aplikasi terbaca sebagai keluarga yang sama.
 */
export function ChapterStatusBadge({
	progress,
	className,
}: {
	progress: ChapterProgress;
	className?: string;
}) {
	const visual = progressVisual[progress];
	const ProgressIcon = visual.icon;

	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
				visual.className,
				className,
			)}
		>
			<ProgressIcon className="size-3.5" />
			{visual.label}
		</span>
	);
}
