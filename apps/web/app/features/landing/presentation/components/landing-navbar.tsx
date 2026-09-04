import { ArrowRightIcon, ExamIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import { cn } from '~/core/lib/utils';
import { useIsAuthenticated } from '~/features/auth/presentation/hooks/use-is-authenticated';
import { landingFor } from '~/features/auth/presentation/hooks/use-role-guard';
import { useSession } from '~/features/auth/presentation/hooks/use-session';

/**
 * Merek aplikasi. Dipakai navbar dan footer landing, jadi bukan bagian dari
 * salah satunya.
 */
export function LandingBrand({ className }: { className?: string }) {
	return (
		<Link to="/" className={cn('flex items-center gap-2.5', className)}>
			<span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
				<ExamIcon weight="fill" className="size-4.5" />
			</span>
			<span className="font-heading text-base font-semibold tracking-tight">
				LED LAM-Teknik
			</span>
		</Link>
	);
}

/**
 * Navbar landing page.
 *
 * Aksi kanannya bergantung pada ada tidaknya sesi tersimpan: tamu ditawari
 * Masuk/Daftar, pengguna yang sudah masuk langsung diantar ke halaman
 * pendaratannya. Tujuannya memakai `landingFor` yang sama dengan penjaga role
 * (docs/application_flow.md §2) supaya Penyusun tidak dikirim ke Dashboard
 * Utama yang justru akan memantulkannya balik.
 */
export function LandingNavbar() {
	const authenticated = useIsAuthenticated();
	const session = useSession();

	return (
		<header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
			<nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
				<LandingBrand />

				{authenticated && session ? (
					<Link
						to={landingFor(session)}
						className={cn(buttonVariants({ size: 'sm' }), 'cursor-pointer')}
					>
						Buka Dashboard
						<ArrowRightIcon className="size-4" />
					</Link>
				) : (
					<div className="flex items-center gap-2">
						<Link
							to="/login"
							className={cn(
								buttonVariants({ variant: 'ghost', size: 'sm' }),
								'cursor-pointer',
							)}
						>
							Masuk
						</Link>
						<Link
							to="/register"
							className={cn(buttonVariants({ size: 'sm' }), 'cursor-pointer')}
						>
							Daftar
						</Link>
					</div>
				)}
			</nav>
		</header>
	);
}
