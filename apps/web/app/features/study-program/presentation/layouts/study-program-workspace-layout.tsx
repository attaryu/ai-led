import * as React from 'react';
import {
	ArchiveIcon,
	FileIcon,
	IdentificationCardIcon,
} from '@phosphor-icons/react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router';

import {
	AppShell,
	type AppShellBreadcrumb,
} from '~/core/components/app-shell';
import { PlaceholderPage } from '~/core/components/placeholder-page';
import {
	canAccessTenant,
	useRoleGuard,
} from '~/features/auth/presentation/hooks/use-role-guard';
import { useActiveTenant } from '~/features/tenant/presentation/hooks/use-active-tenant';
import { studyProgramRepository } from '../../data/repositories/study-program.repository';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';

/**
 * Lapis 2 — Dashboard Prodi (docs/application_flow.md §5).
 *
 * `programId` di URL adalah satu-satunya sumber kebenaran konteks prodi.
 * Pimpinan/Penjamin Mutu memilih prodi lewat navigasi sehingga konteksnya tidak
 * bisa diturunkan dari session; menaruhnya di URL sekaligus membuat halaman ini
 * tahan muat ulang dan bisa dibagikan lewat tautan.
 */
export function StudyProgramWorkspaceLayout() {
	const { programId } = useParams<{ programId: string }>();
	const location = useLocation();
	const tenant = useActiveTenant();
	const guard = useRoleGuard('program', programId);
	const [studyProgram, setStudyProgram] = React.useState<
		StudyProgramEntity | null | undefined
	>(undefined);

	React.useEffect(() => {
		if (!programId) {
			setStudyProgram(null);
			return;
		}
		setStudyProgram(undefined);
		let cancelled = false;
		studyProgramRepository.findById(programId).then((found) => {
			if (!cancelled) setStudyProgram(found ?? null);
		});
		return () => {
			cancelled = true;
		};
	}, [programId]);

	if (guard.status === 'pending' || studyProgram === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
				Memuat…
			</div>
		);
	}

	if (guard.status === 'denied') {
		return <Navigate to={guard.redirectTo} replace />;
	}

	// Penyusun mendarat langsung di sini dan tidak punya lapis di atasnya (§2).
	const showTenantLink = canAccessTenant(guard.session);
	const tenantCrumb: AppShellBreadcrumb[] = showTenantLink
		? [{ to: '/dashboard', label: 'Dashboard' }]
		: [];

	// Prodi bisa terhapus lewat manajemen di lapis tenant sementara tautannya
	// masih tersimpan di tab lain, jadi kondisi ini normal — bukan error.
	if (!studyProgram) {
		return (
			<AppShell
				sidebar={{
					universityName: tenant.universityName,
					backTo: showTenantLink ? '/dashboard' : null,
					eyebrow: 'Dashboard Prodi',
					contextTitle: 'Tidak ditemukan',
					items: [],
				}}
				breadcrumbs={[...tenantCrumb, { label: 'Prodi tidak ditemukan' }]}
			>
				<PlaceholderPage
					title="Prodi tidak ditemukan"
					description={`Tidak ada Program Studi dengan ID "${programId}". Mungkin sudah dihapus.`}
					// Penyusun tidak berhak atas daftar prodi, dan bila prodinya sendiri
					// yang terhapus ia memang tidak punya tujuan lain — hubungi Pimpinan.
					links={
						showTenantLink
							? [
									{
										label: 'Lihat daftar Program Studi',
										to: '/dashboard/study-programs',
									},
								]
							: []
					}
				/>
			</AppShell>
		);
	}

	return (
		<AppShell
			sidebar={{
				universityName: tenant.universityName,
				backTo: showTenantLink ? '/dashboard' : null,
				eyebrow: 'Dashboard Prodi',
				contextTitle: studyProgram.studyProgramName,
				items: [
					{
						// Halamannya bukan daftar dokumen melainkan keadaan prodi itu
						// sendiri — akreditasi berjalan, dokumen yang disusun, dan timnya
						// (§5.1), jadi namanya menyebut subjeknya.
						name: 'Profil Prodi',
						path: `/study-programs/${programId}`,
						icon: IdentificationCardIcon,
						end: true,
					},
					{
						name: 'Dokumen LED',
						path: `/study-programs/${programId}/led-projects`,
						icon: FileIcon,
					},
					{
						name: 'Bukti Dukung',
						path: `/study-programs/${programId}/evidence`,
						icon: ArchiveIcon,
					},
				],
			}}
			breadcrumbs={[
				...tenantCrumb,
				{
					to: `/study-programs/${programId}`,
					label: studyProgram.studyProgramName,
				},
				// Sub-halaman prodi ikut muncul; halaman index sudah diwakili nama
				// prodi di atas, jadi ia tidak menambah entri.
				...(location.pathname.endsWith('/led-projects')
					? [{ label: 'Dokumen LED' }]
					: []),
				...(location.pathname.endsWith('/evidence')
					? [{ label: 'Bukti Dukung' }]
					: []),
			]}
		>
			<Outlet context={studyProgram} />
		</AppShell>
	);
}
