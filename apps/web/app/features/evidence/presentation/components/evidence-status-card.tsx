import {
	ArrowRightIcon,
	ArrowsClockwiseIcon,
	BooksIcon,
	CheckCircleIcon,
	ClockIcon,
	StackIcon,
	WarningCircleIcon,
	type Icon,
} from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import {
	StatBlock,
	StatIconBox,
	type StatCardTone,
} from '~/core/components/ui/stat-card';
import { type EvidenceSummary } from '../../domain/entities/evidence.entity';

/**
 * Kartu status Bukti Dukung: judul, tombol ke perpustakaannya, dan lima angka
 * status. Dipakai Dashboard Utama (level universitas) dan Dashboard Program
 * Studi, jadi cakupan angkanya harus sama dengan daftar di halaman yang dituju
 * `href` (§4.4, §5.2).
 */
export function EvidenceStatusCard({
	judul,
	ringkasan,
	href,
	pesanKosong,
}: {
	judul: string;
	ringkasan: EvidenceSummary;
	href: string;
	pesanKosong: string;
}) {
	const tiles: {
		label: string;
		value: number;
		tone: StatCardTone;
		icon: Icon;
	}[] = [
		{ label: 'Total', value: ringkasan.total, tone: 'default', icon: StackIcon },
		{ label: 'Siap', value: ringkasan.siap, tone: 'success', icon: CheckCircleIcon },
		{
			label: 'Diproses',
			value: ringkasan.diproses,
			tone: 'info',
			icon: ArrowsClockwiseIcon,
		},
		{ label: 'Menunggu', value: ringkasan.menunggu, tone: 'default', icon: ClockIcon },
		{ label: 'Gagal', value: ringkasan.gagal, tone: 'warning', icon: WarningCircleIcon },
	];

	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-3">
					<StatIconBox icon={BooksIcon} size="sm" />
					{judul}
				</CardTitle>
				<CardAction className="self-center">
					<Link
						to={href}
						className={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						Buka perpustakaan
						<ArrowRightIcon className="size-4" />
					</Link>
				</CardAction>
			</CardHeader>
			<CardContent>
				{ringkasan.total === 0 ? (
					<p className="text-sm text-muted-foreground">{pesanKosong}</p>
				) : (
					<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
						{tiles.map(({ label, value, tone, icon }) => (
							<StatBlock
								key={label}
								label={label}
								value={String(value)}
								icon={icon}
								size="sm"
								tone={value === 0 ? 'muted' : tone}
								className="rounded-lg bg-muted/50 px-3 py-2.5 ring-1 ring-border"
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
