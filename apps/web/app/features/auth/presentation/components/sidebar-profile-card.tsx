import { cn } from '~/core/lib/utils';
import { initials } from '~/core/lib/initials';
import { useSession } from '../hooks/use-session';
import { ProfileMenu } from './profile-menu';

/**
 * Card identitas di dasar sidebar, dirender `AppShell` untuk ketiga lapis.
 *
 * Sebelumnya tombol keluar dititipkan lewat `AppShellSidebar.footer` dan hanya
 * diisi lapis tenant, sehingga dari Dashboard Program Studi maupun Dokumen LED tidak ada
 * satu pun jalan keluar. Menaruhnya di chrome bersama membuat celah itu tidak
 * bisa terulang: tidak ada lapis yang perlu mengingat untuk memasangnya.
 */
export function SidebarProfileCard({ ciut = false }: { ciut?: boolean }) {
	const session = useSession();

	if (!session) {
		return <div className="h-14 animate-pulse rounded-xl bg-sidebar-accent" />;
	}

	/*
	 * Varian avatar-saja untuk rel 64 px. Di sana kartu berhenti masuk akal:
	 * sebuah kotak berisi satu lingkaran, seukuran lingkaran itu sendiri, cuma
	 * menambah tepi tanpa menambah arti. `ProfileMenu` ikut lepas dari tombol
	 * titik tiga dan pindah ke avatarnya — jalan keluar dari aplikasi tidak
	 * boleh ikut menghilang bersama kartunya.
	 *
	 * **Dirender berdampingan dengan kartu penuh, bukan menggantikannya.**
	 * `ciut` hanya berlaku di `lg` ke atas; di bawah itu sidebar adalah laci
	 * selebar 256 px yang tetap butuh kartu utuh. Mengembalikan varian ini lebih
	 * awal lewat `if (ciut) return` membuat laci di 768 px kehilangan kartu
	 * profilnya sama sekali — dan bersamanya, satu-satunya tombol Keluar.
	 */
	const avatarSaja = ciut ? (
		<div className="hidden lg:flex lg:justify-center">
			<ProfileMenu
				side="right"
				render={
					<button
						type="button"
						aria-label={`${session.namaLengkap} · ${session.role}`}
						className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground"
					>
						{initials(session.namaLengkap)}
					</button>
				}
			/>
		</div>
	) : null;

	/*
	 * Permukaannya `bg-background` + ring, bukan `bg-sidebar-accent/50`.
	 *
	 * Nilai lama jatuh di sekitar 0.934 — **lebih gelap** dari ground sidebar
	 * (0.953), sehingga ia terbaca sebagai cekungan, bukan kartu yang terangkat.
	 * Bahasa permukaan yang dipakai seluruh tata letak inset menaik: ground
	 * paling gelap, yang terangkat lebih terang. Kartu ini sekarang memakai
	 * permukaan dan ring yang sama persis dengan kartu konten di sebelahnya.
	 *
	 * Sekaligus melepaskannya dari `--sidebar-accent`, yang menandai menu aktif.
	 * Dua hal berbeda yang memakai satu warna berarti penanda "kamu di sini"
	 * harus bersaing dengan blok yang tidak pernah jadi tujuan navigasi.
	 */
	return (
		<>
			{avatarSaja}

			<div
				className={cn(
					'flex items-center gap-3 rounded-xl bg-background p-2.5 ring-1 ring-foreground/10',
					ciut && 'lg:hidden',
				)}
			>
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
		</>
	);
}
