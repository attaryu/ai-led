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
	success: 'text-emerald-700 dark:text-emerald-400',
	info: 'text-sky-700 dark:text-sky-400',
} as const;

export type StatCardTone = keyof typeof toneStyles;

/** Warna kotak ikon per nada: latar berwarna lembut, ikon berwarna penuh. */
const iconBoxStyles: Record<StatCardTone, string> = {
	default: 'bg-primary/10 text-primary',
	muted: 'bg-muted text-muted-foreground',
	warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
	danger: 'bg-destructive/10 text-destructive',
	success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
	info: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
};

/** Ikon di dalam kotak persegi membulat yang warnanya mengikuti nada. */
export function StatIconBox({
	icon: BoxIcon,
	tone = 'default',
	size = 'md',
	className,
}: {
	icon: Icon;
	tone?: StatCardTone;
	size?: 'sm' | 'md';
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'flex shrink-0 items-center justify-center rounded-lg',
				size === 'md' ? 'size-11' : 'size-9',
				iconBoxStyles[tone],
				className,
			)}
		>
			<BoxIcon className={size === 'md' ? 'size-6' : 'size-5'} weight="duotone" />
		</span>
	);
}

/**
 * Susunan horizontal: kotak ikon di kiri, di kanannya satu wadah berisi judul
 * (kecil, redup) di atas dan angka besar di bawah.
 */
export function StatBlock({
	label,
	value,
	icon,
	tone = 'default',
	size = 'md',
	className,
}: {
	label: string;
	value: string;
	icon: Icon;
	tone?: StatCardTone;
	size?: 'sm' | 'md';
	className?: string;
}) {
	return (
		<div className={cn('flex items-center gap-3', className)}>
			<StatIconBox icon={icon} tone={tone} size={size} />
			<div className="flex min-w-0 flex-col">
				<p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
				<p
					className={cn(
						'font-heading text-2xl font-bold tracking-tight tabular-nums',
						toneStyles[tone],
					)}
				>
					{value}
				</p>
			</div>
		</div>
	);
}

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
	boxed = false,
	className,
}: {
	label: string;
	value: string;
	hint?: string;
	icon?: Icon;
	/** 0–100. Bila diisi, bar progres dirender di bawah angka. */
	progress?: number;
	tone?: StatCardTone;
	/**
	 * Ikon di kotak berwarna sebelah kiri judul+angka (butuh `icon`). Tanpa ini
	 * ikon tetap kecil di baris judul, seperti pemanggil lama.
	 */
	boxed?: boolean;
	className?: string;
}) {
	if (boxed && StatIcon) {
		return (
			<Card size="sm" className={className}>
				<CardContent>
					<StatBlock label={label} value={value} icon={StatIcon} tone={tone} />
				</CardContent>
			</Card>
		);
	}

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
