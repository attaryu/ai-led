import {
	CircleDashedIcon,
	ClockIcon,
	LockSimpleIcon,
	PencilSimpleLineIcon,
	type Icon,
} from '@phosphor-icons/react';

import { cn } from '~/core/lib/utils';
import {
	chapterProgressLabels,
	type ChapterProgress,
} from '~/features/chapter/domain/entities/chapter.entity';

/**
 * Ikon, warna, dan label tiap status — satu sumber bagi badge di tabel Progres per
 * Bab dan ikon status di Daftar Isi Editor.
 */
export const progressVisual: Record<
	ChapterProgress,
	{ label: string; icon: Icon; className: string; iconClassName: string }
> = {
	BELUM_DIISI: {
		label: chapterProgressLabels.BELUM_DIISI,
		icon: CircleDashedIcon,
		iconClassName: 'text-slate-500 dark:text-slate-400',
		className:
			'bg-slate-100 text-slate-800 border-slate-200/50 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800/30',
	},
	SEDANG_DISUSUN: {
		label: chapterProgressLabels.SEDANG_DISUSUN,
		icon: PencilSimpleLineIcon,
		iconClassName: 'text-amber-600 dark:text-amber-400',
		className:
			'bg-amber-100 text-amber-800 border-amber-200/50 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/30',
	},
	// Ikon jam mengikuti `EvidenceStatusBadge.MENUNGGU` supaya "sedang mengantre"
	// terbaca sama di kedua keluarga status. Warnanya biru, bukan amber, karena
	// bab yang diajukan bukan pekerjaan tertunda melainkan giliran orang lain.
	MENUNGGU_REVIEW: {
		label: chapterProgressLabels.MENUNGGU_REVIEW,
		icon: ClockIcon,
		iconClassName: 'text-sky-600 dark:text-sky-400',
		className:
			'bg-sky-100 text-sky-800 border-sky-200/50 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800/30',
	},
	TERKUNCI: {
		label: chapterProgressLabels.TERKUNCI,
		icon: LockSimpleIcon,
		iconClassName: 'text-emerald-600 dark:text-emerald-400',
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
