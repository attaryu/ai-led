import { ArrowLeftIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { initials } from '~/core/lib/initials';
import { ProfileMenu } from '~/features/auth/presentation/components/profile-menu';
import { RoleSwitcher } from '~/features/auth/presentation/components/role-switcher';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { type AutosaveStatus } from '../hooks/use-chapter-autosave';
import { ChapterSaveIndicator } from './chapter-save-indicator';

/**
 * Header Editor Bab.
 *
 * `RoleSwitcher` ikut dipasang di sini karena Editor Bab tidak memakai
 * `AppShell` — tanpa itu tidak ada satu pun jalan menguji jalur "Pimpinan hanya
 * baca" (§15) tanpa keluar dari halaman. Ia tetap alat pengembangan sementara
 * yang dihapus bersama seluruh pemanggilnya begitu autentikasi sungguhan jalan.
 */
export function ChapterEditorHeader({
	projectId,
	judulDokumen,
	status,
	savedAt,
}: {
	projectId: string;
	judulDokumen: string;
	status: AutosaveStatus;
	savedAt: string | null;
}) {
	const session = useSession();

	return (
		<header className="flex h-16 shrink-0 items-center gap-5 border-b border-border bg-card px-5">
			{/*
			 * Kembali ke Dashboard Project LED, bukan ke `/dashboard` harfiah seperti
			 * tulisan di rancangan: lapis tenant tidak boleh diakses Penyusun (§2),
			 * jadi tautan harfiah akan dipantulkan `useRoleGuard` untuknya. Satu
			 * lapis ke atas benar untuk semua role (§3) dan tetap terbaca "Dashboard".
			 */}
			<Link
				to={`/led-projects/${projectId}`}
				className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeftIcon className="size-4" />
				Dashboard
			</Link>

			<h1 className="truncate font-heading text-lg font-bold tracking-tight">
				{judulDokumen}
			</h1>

			<ChapterSaveIndicator status={status} savedAt={savedAt} />

			<div className="ml-auto flex shrink-0 items-center gap-4">
				<RoleSwitcher />

				{session && (
					<div className="flex items-center gap-2">
						{/*
						 * Inisial, bukan foto: `SESSION`/`USER` (docs/database.md) tidak
						 * punya kolom avatar, dan mengarang field demi rancangan hanya
						 * akan jadi data palsu yang harus dibongkar nanti.
						 */}
						<span
							aria-hidden
							className="flex size-8 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground"
						>
							{initials(session.namaLengkap)}
						</span>
						<span className="text-sm font-medium">{session.namaLengkap}</span>

						{/*
						 * Menu yang sama dengan card profil sidebar. Editor Bab tidak
						 * memakai `AppShell`, jadi tanpa ini ia jadi satu-satunya halaman
						 * yang tidak punya jalan keluar.
						 */}
						<ProfileMenu />
					</div>
				)}
			</div>
		</header>
	);
}
