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
	galat,
}: {
	judul: string;
	/** `null` selama belum selesai dimuat — bagian isi tidak menampilkan apa pun. */
	ringkasan: EvidenceSummary | null;
	href: string;
	pesanKosong: string;
	/** Pesan bila pembacaan gagal; menggantikan isi kartu. */
	galat?: string;
}) {
	const tiles: {
		label: string;
		value: number;
		tone: StatCardTone;
		icon: Icon;
	}[] = [
		{ label: 'Total', value: ringkasan?.total ?? 0, tone: 'default', icon: StackIcon },
		{ label: 'Siap', value: ringkasan?.siap ?? 0, tone: 'success', icon: CheckCircleIcon },
		{
			label: 'Diproses',
			value: ringkasan?.diproses ?? 0,
			tone: 'info',
			icon: ArrowsClockwiseIcon,
		},
		{ label: 'Menunggu', value: ringkasan?.menunggu ?? 0, tone: 'default', icon: ClockIcon },
		{ label: 'Gagal', value: ringkasan?.gagal ?? 0, tone: 'warning', icon: WarningCircleIcon },
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
				{galat ? (
					<p className="flex items-start gap-2 text-sm text-destructive">
						<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
						{galat}
					</p>
				) : ringkasan === null ? null : ringkasan.total === 0 ? (
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
