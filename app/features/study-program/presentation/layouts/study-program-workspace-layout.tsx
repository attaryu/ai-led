import { ArchiveIcon, FileIcon } from '@phosphor-icons/react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router';

import {
	AppShell,
	type AppShellBreadcrumb,
} from '~/core/components/app-shell';
import { PlaceholderPage } from '~/core/components/placeholder-page';
import { RoleSwitcher } from '~/features/auth/presentation/components/role-switcher';
import {
	canAccessTenant,
	useRoleGuard,
} from '~/features/auth/presentation/hooks/use-role-guard';
import { studyProgramRepository } from '../../data/repositories/study-program.repository';

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
	const guard = useRoleGuard('program', programId);

	if (guard.status === 'denied') {
		return <Navigate to={guard.redirectTo} replace />;
	}

	// Penyusun mendarat langsung di sini dan tidak punya lapis di atasnya (§2).
	const showTenantLink =
		guard.status === 'allowed' && canAccessTenant(guard.session);
	const tenantCrumb: AppShellBreadcrumb[] = showTenantLink
		? [{ to: '/dashboard', label: 'Dashboard' }]
		: [];

	const studyProgram = programId
		? studyProgramRepository.findById(programId)
		: undefined;

	// Prodi bisa terhapus lewat manajemen di lapis tenant sementara tautannya
	// masih tersimpan di tab lain, jadi kondisi ini normal — bukan error.
	if (!studyProgram) {
		return (
			<AppShell
				sidebar={{
					backTo: showTenantLink ? '/dashboard' : null,
					backLabel: 'Dashboard Utama',
					eyebrow: 'Dashboard Prodi',
					brand: 'Tidak ditemukan',
					items: [],
				}}
				breadcrumbs={[...tenantCrumb, { label: 'Prodi tidak ditemukan' }]}
				headerAction={<RoleSwitcher />}
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
				backTo: showTenantLink ? '/dashboard' : null,
				backLabel: 'Dashboard Utama',
				eyebrow: 'Dashboard Prodi',
				brand: studyProgram.studyProgramName,
				items: [
					{
						name: 'Dokumen LED',
						path: `/study-programs/${programId}`,
						icon: FileIcon,
						end: true,
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
				...(location.pathname.endsWith('/evidence')
					? [{ label: 'Bukti Dukung' }]
					: []),
			]}
			headerAction={<RoleSwitcher />}
		>
			<Outlet />
		</AppShell>
	);
}
