import { type Icon } from '@phosphor-icons/react';

import { Card, CardContent, CardHeader, CardTitle } from '~/core/components/ui/card';
import { cn } from '~/core/lib/utils';

/**
 * Nada angka. Dipakai untuk hal yang punya urgensi bawaan — tenggat yang lewat
 * harus terbaca berbeda dari angka biasa tanpa perlu membaca keterangannya.
 */
const toneStyles = {
	default: '',
	muted: 'text-muted-foreground',
	warning: 'text-amber-700 dark:text-amber-400',
	danger: 'text-destructive',
} as const;

export type StatCardTone = keyof typeof toneStyles;

/**
 * Kartu satu angka untuk baris ringkasan dashboard.
 *
 * Ditaruh di `core` karena bentuk yang sama akan dipakai lagi oleh dashboard
 * prodi dan dashboard agregat institusi — yang berbeda hanya angkanya.
 */
export function StatCard({
	label,
	value,
	hint,
	icon: StatIcon,
	progress,
	tone = 'default',
	className,
}: {
	label: string;
	value: string;
	hint?: string;
	icon?: Icon;
	/** 0–100. Bila diisi, bar progres dirender di bawah angka. */
	progress?: number;
	tone?: StatCardTone;
	className?: string;
}) {
	const clamped =
		progress === undefined
			? undefined
			: Math.max(0, Math.min(100, Math.round(progress)));

	return (
		<Card size="sm" className={cn('gap-3', className)}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
					{StatIcon && <StatIcon className="size-4 shrink-0" weight="duotone" />}
					{label}
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				<p
					className={cn(
						'font-heading text-2xl font-bold tracking-tight tabular-nums',
						toneStyles[tone],
					)}
				>
					{value}
				</p>
				{clamped !== undefined && (
					<div
						className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
						role="progressbar"
						aria-valuenow={clamped}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label={label}
					>
						<div
							className="h-full rounded-full bg-primary transition-[width]"
							style={{ width: `${clamped}%` }}
						/>
					</div>
				)}
				{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			</CardContent>
		</Card>
	);
}
