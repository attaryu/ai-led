import {
	ArrowRightIcon,
	BuildingsIcon,
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
import { StatCard } from '~/core/components/ui/stat-card';
import { userRoleEnum } from '~/features/users/domain/entities/user.entity';
import { useOrganizationSummary } from '../hooks/use-organization-summary';

/**
 * Dashboard Utama versi `Admin` (docs/application_flow.md §4.0e).
 *
 * Admin boleh masuk lapis tenant karena ia berwenang atas menu organisasi, tapi
 * ia **tidak pernah** melihat progres penyusunan LED: ia ditolak di seluruh
 * lapis prodi dan dokumen (§6.2), dan menu bukti dukung pun menolaknya secara
 * eksplisit (§4.4). Menampilkan agregat kesiapan akreditasi kepadanya berarti
 * membocorkan lewat ringkasan apa yang sudah ditutup lewat rute.
 *
 * Yang tersisa justru tepat jadi ringkasannya: seberapa lengkap organisasi yang
 * memang jadi wewenangnya — prodi, akun, dan penugasan.
 */
export function AdminOrganizationSummary() {
	const { totalProdi, totalUser, userPerRole, prodiTanpaPenyusun } =
		useOrganizationSummary();

	return (
		<div className="flex flex-col gap-8">
			<div className="grid gap-4 sm:grid-cols-2">
				<StatCard
					label="Program Studi"
					icon={BuildingsIcon}
					value={String(totalProdi)}
					hint="Program studi terdaftar di universitas ini"
				/>
				<StatCard
					label="Akun Pengguna"
					icon={UsersThreeIcon}
					value={String(totalUser)}
					hint={userRoleEnum.options
						.map((role) => `${userPerRole[role]} ${role}`)
						.join(' · ')}
				/>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<Card size="sm">
					<CardHeader>
						<CardTitle>Penugasan Penyusun</CardTitle>
						<CardDescription>
							{prodiTanpaPenyusun === 0
								? 'Seluruh program studi sudah punya Penyusun.'
								: `${prodiTanpaPenyusun} dari ${totalProdi} program studi belum punya Penyusun.`}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{prodiTanpaPenyusun > 0 && (
							<p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
								<WarningCircleIcon
									className="mt-0.5 size-4 shrink-0"
									weight="fill"
								/>
								Akunnya dibuat di sini, penempatannya ke program studi dilakukan Pimpinan.
							</p>
						)}
						<div>
							<Link
								to="/dashboard/users"
								className={buttonVariants({ variant: 'outline', size: 'sm' })}
							>
								Pengguna
								<ArrowRightIcon className="size-4" />
							</Link>
						</div>
					</CardContent>
				</Card>

				<Card size="sm">
					<CardHeader>
						<CardTitle>Program Studi</CardTitle>
						<CardDescription>
							Tambah dan ubah data program studi.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Link
							to="/dashboard/study-programs"
							className={buttonVariants({ variant: 'outline', size: 'sm' })}
						>
							Kelola program studi
							<ArrowRightIcon className="size-4" />
						</Link>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
