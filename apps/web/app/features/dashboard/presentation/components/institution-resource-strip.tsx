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
import { type InstitutionResources } from '../../domain/entities/institution-readiness.entity';

/**
 * Dashboard Utama §4.0d (docs/application_flow.md) — bekal yang berlaku
 * **lintas penyusunan**, karena itu berdiri di luar baris ringkasan dokumen
 * yang sedang disusun dan menyebut kerangka waktunya sendiri.
 */
export function InstitutionResourceStrip({
	sumberDaya,
}: {
	sumberDaya: InstitutionResources;
}) {
	const { evidenceTenant } = sumberDaya;

	const tiles: {
		label: string;
		value: number;
		tone: StatCardTone;
		icon: Icon;
	}[] = [
		{ label: 'Total', value: evidenceTenant.total, tone: 'default', icon: StackIcon },
		{ label: 'Siap', value: evidenceTenant.siap, tone: 'success', icon: CheckCircleIcon },
		{
			label: 'Diproses',
			value: evidenceTenant.diproses,
			tone: 'info',
			icon: ArrowsClockwiseIcon,
		},
		{ label: 'Menunggu', value: evidenceTenant.menunggu, tone: 'default', icon: ClockIcon },
		{ label: 'Gagal', value: evidenceTenant.gagal, tone: 'warning', icon: WarningCircleIcon },
	];

	return (
		<section className="flex flex-col gap-3">
			<div>
				<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Sumber Daya Institusi
				</p>
			</div>

			<div className="grid gap-4">
				<Card size="sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-3">
							<StatIconBox icon={BooksIcon} size="sm" />
							Bukti Dukung Universitas
						</CardTitle>
						<CardAction className="self-center">
							<Link
								to="/dashboard/evidence"
								className={buttonVariants({ variant: 'outline', size: 'sm' })}
							>
								Buka perpustakaan
								<ArrowRightIcon className="size-4" />
							</Link>
						</CardAction>
					</CardHeader>
					<CardContent>
						{/*
						 * Cakupannya hanya `owner_tipe = TENANT` supaya angkanya cocok
						 * dengan daftar di halaman yang dituju tombolnya (§4.4) — aturan
						 * yang sama dengan panel Bukti Dukung di §5.1c.
						 */}
						{evidenceTenant.total === 0 ? (
							<p className="text-sm text-muted-foreground">
								Belum ada berkas level universitas.
							</p>
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
			</div>
		</section>
	);
}
