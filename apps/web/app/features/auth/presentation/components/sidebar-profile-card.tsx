import { initials } from '~/core/lib/initials';
import { useSession } from '../hooks/use-session';
import { ProfileMenu } from './profile-menu';

/**
 * Card identitas di dasar sidebar, dirender `AppShell` untuk ketiga lapis.
 *
 * Sebelumnya tombol keluar dititipkan lewat `AppShellSidebar.footer` dan hanya
 * diisi lapis tenant, sehingga dari Dashboard Prodi maupun Dokumen LED tidak ada
 * satu pun jalan keluar. Menaruhnya di chrome bersama membuat celah itu tidak
 * bisa terulang: tidak ada lapis yang perlu mengingat untuk memasangnya.
 */
export function SidebarProfileCard() {
	const session = useSession();

	if (!session) {
		return <div className="h-14 animate-pulse rounded-lg bg-sidebar-accent" />;
	}

	return (
		<div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-2.5">
			{/*
			 * Inisial, bukan foto: `SESSION`/`USER` (docs/database.md) tidak punya
			 * kolom avatar, jadi tidak ada yang bisa ditampilkan selain namanya.
			 */}
			<span
				aria-hidden
				className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground"
			>
				{initials(session.namaLengkap)}
			</span>

			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium" title={session.namaLengkap}>
					{session.namaLengkap}
				</p>
				<p className="truncate text-xs text-sidebar-foreground/60">
					{session.role}
				</p>
			</div>

			{/* Card menempel di dasar layar, jadi menunya dibuka ke atas. */}
			<ProfileMenu side="top" />
		</div>
	);
}
