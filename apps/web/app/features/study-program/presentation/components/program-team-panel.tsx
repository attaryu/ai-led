import { UserIcon, WarningCircleIcon } from '@phosphor-icons/react';

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { type UserEntity } from '~/features/users/domain/entities/user.entity';

/**
 * Penyusun yang ditugaskan ke program studi ini (docs/application_flow.md §5.1c).
 *
 * Prodi tanpa Penyusun bukan daftar kosong biasa: dokumennya tidak akan pernah
 * bergerak, jadi keadaan itu ditampilkan sebagai peringatan beserta jalan
 * keluarnya. Tautan ke Manajemen User sengaja tidak dipasang — halaman ini
 * dibuka juga oleh Penyusun dan Penjamin Mutu yang tidak berhak ke sana (§15),
 * dan menaruh tautan yang berujung penolakan hanya membingungkan.
 */
export function ProgramTeamPanel({
	penyusun,
	galat = false,
}: {
	/** `null` selama belum selesai dimuat — panel tidak menampilkan apa pun. */
	penyusun: UserEntity[] | null;
	/** Gagal dimuat; berbeda dari prodi yang memang belum punya Penyusun. */
	galat?: boolean;
}) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Tim Penyusun</CardTitle>
			</CardHeader>
			<CardContent>
				{galat ? (
					<p className="flex items-start gap-2 text-sm text-destructive">
						<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
						Gagal memuat tim penyusun.
					</p>
				) : penyusun === null ? null : penyusun.length === 0 ? (
					<p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
						<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
						Penyusun ditempatkan oleh Pimpinan lewat menu Pengguna.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{penyusun.map((user) => (
							<li key={user.id} className="flex items-center gap-2 text-sm">
								<UserIcon
									className="size-4 shrink-0 text-muted-foreground"
									weight="duotone"
								/>
								<span className="truncate">{user.namaLengkap}</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
