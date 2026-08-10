import {
	ArrowRightIcon,
	UsersThreeIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { formatRelativeTime } from '~/core/lib/format-time';
import { type InstitutionResources } from '../../domain/entities/institution-readiness.entity';

/**
 * Dashboard Utama §4.0d (docs/application_flow.md) — bekal yang berlaku
 * **lintas penyusunan**, karena itu berdiri di luar baris ringkasan dokumen
 * yang sedang disusun dan menyebut kerangka waktunya sendiri.
 */
export function InstitutionResourceStrip({
	sumberDaya,
	totalProdi,
	dapatKelolaUser,
}: {
	sumberDaya: InstitutionResources;
	totalProdi: number;
	/**
	 * Tautan ke Manajemen User hanya dirender untuk yang berhak (§1). Penjamin
	 * Mutu tidak punya menu itu sama sekali (§4.2), jadi menyodorkan tautan
	 * kepadanya hanya berujung pengalihan — cacat yang sama yang sudah dihindari
	 * §5.1c.
	 */
	dapatKelolaUser: boolean;
}) {
	const { evidenceTenant, prodiTanpaPenyusun } = sumberDaya;
	const belumSiap = evidenceTenant.menunggu + evidenceTenant.diproses;

	// Penyebutnya total prodi, sama dengan hitungan "n dari m prodi sedang
	// menyusun" di subjudul §4.0c, supaya dua angka di halaman yang sama tidak
	// diam-diam mengukur hal berbeda.
	const persenTanpaPenyusun =
		totalProdi === 0 ? 0 : Math.round((prodiTanpaPenyusun / totalProdi) * 100);

	return (
		<section className="flex flex-col gap-3">
			<div>
				<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Sumber Daya Institusi
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Bekal yang berlaku lintas penyusunan, bukan ukuran pekerjaan yang
					sedang disusun.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<Card size="sm">
					<CardHeader>
						<CardTitle>Bukti Dukung Universitas</CardTitle>
						<CardDescription>
							{evidenceTenant.total === 0
								? 'Belum ada berkas level universitas.'
								: `${evidenceTenant.siap} dari ${evidenceTenant.total} berkas siap dipakai AI (${evidenceTenant.persenSiap}%).`}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{/*
						 * Cakupannya hanya `owner_tipe = TENANT` supaya angkanya cocok
						 * dengan daftar di halaman yang dituju tombolnya (§4.4) — aturan
						 * yang sama dengan panel Bukti Dukung Prodi di §5.1c.
						 */}
						{evidenceTenant.total > 0 && (
							<div
								className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
								role="progressbar"
								aria-valuenow={evidenceTenant.persenSiap}
								aria-valuemin={0}
								aria-valuemax={100}
								aria-label="Bukti dukung universitas yang siap"
							>
								<div
									className="h-full rounded-full bg-primary transition-[width]"
									style={{ width: `${evidenceTenant.persenSiap}%` }}
								/>
							</div>
						)}

						{belumSiap > 0 && (
							<p className="text-xs text-muted-foreground">
								{belumSiap} berkas masih dalam antrean ekstraksi.
							</p>
						)}

						{evidenceTenant.gagal > 0 && (
							<p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
								<WarningCircleIcon
									className="mt-0.5 size-3.5 shrink-0"
									weight="fill"
								/>
								{evidenceTenant.gagal} berkas gagal diproses dan bisa dicoba
								ulang.
							</p>
						)}

						{evidenceTenant.terakhirDiunggah &&
							evidenceTenant.berkasTerakhir && (
								<p className="truncate text-xs text-muted-foreground">
									Terakhir: {evidenceTenant.berkasTerakhir} ·{' '}
									{formatRelativeTime(evidenceTenant.terakhirDiunggah)}
								</p>
							)}

						<div>
							<Link
								to="/dashboard/evidence"
								className={buttonVariants({ variant: 'outline', size: 'sm' })}
							>
								Buka perpustakaan
								<ArrowRightIcon className="size-4" />
							</Link>
						</div>
					</CardContent>
				</Card>

				{/*
				 * Prodi tanpa Penyusun bukan angka biasa: dokumennya tidak akan pernah
				 * bergerak sampai ada yang ditugaskan, jadi keadaan itu ditampilkan
				 * sebagai peringatan (§5.1c).
				 */}
				<Card size="sm">
					<CardHeader>
						<CardTitle>Tim Penyusun</CardTitle>
						<CardDescription>
							{prodiTanpaPenyusun === 0
								? `Seluruh ${totalProdi} prodi sudah punya Penyusun.`
								: `${prodiTanpaPenyusun} dari ${totalProdi} prodi belum punya Penyusun (${persenTanpaPenyusun}%).`}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{prodiTanpaPenyusun > 0 ? (
							<p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
								<WarningCircleIcon
									className="mt-0.5 size-4 shrink-0"
									weight="fill"
								/>
								Dokumen prodi tersebut tidak akan bergerak sampai ada user yang
								ditugaskan menulisnya.
							</p>
						) : (
							<p className="flex items-start gap-2 text-sm text-muted-foreground">
								<UsersThreeIcon
									className="mt-0.5 size-4 shrink-0"
									weight="duotone"
								/>
								Tiap prodi punya setidaknya satu user yang bertugas menulis
								dokumennya.
							</p>
						)}

						{dapatKelolaUser && (
							<div>
								<Link
									to="/dashboard/users"
									className={buttonVariants({ variant: 'outline', size: 'sm' })}
								>
									Kelola penugasan
									<ArrowRightIcon className="size-4" />
								</Link>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</section>
	);
}
