import { ListChecksIcon } from '@phosphor-icons/react';
import { Navigate, Outlet, useParams } from 'react-router';

import { AppShell, type AppShellBreadcrumb } from '~/core/components/app-shell';
import { PlaceholderPage } from '~/core/components/placeholder-page';
import { RoleSwitcher } from '~/features/auth/presentation/components/role-switcher';
import {
	canAccessTenant,
	useRoleGuard,
} from '~/features/auth/presentation/hooks/use-role-guard';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { ledProjectRepository } from '../../data/repositories/led-project.repository';

/**
 * Lapis 3 — Dashboard Project LED (docs/application_flow.md §6).
 *
 * Prodi pemilik dokumen dibaca dari datanya, bukan dari URL, supaya tidak ada
 * pasangan id yang bisa dibuat tidak cocok lewat address bar. Nilai itu pula
 * yang dipakai guard untuk membatasi Penyusun ke prodinya sendiri.
 */
export function LedProjectWorkspaceLayout() {
	const { projectId } = useParams<{ projectId: string }>();
	const session = useSession();
	const ledProject = projectId
		? ledProjectRepository.findById(projectId)
		: undefined;
	const guard = useRoleGuard('project', ledProject?.studyProgramId);

	if (guard.status === 'denied') {
		return <Navigate to={guard.redirectTo} replace />;
	}

	// Saat dokumen tidak ditemukan, guard mengembalikan `pending` untuk Penyusun
	// (prodi pemilik tidak bisa dipastikan), jadi role dibaca dari session agar
	// jalan keluarnya tetap sesuai haknya.
	const showTenantLink = session ? canAccessTenant(session) : false;
	const tenantCrumb: AppShellBreadcrumb[] = showTenantLink
		? [{ to: '/dashboard', label: 'Dashboard' }]
		: [];

	if (!ledProject) {
		// Penyusun tidak berhak atas daftar lintas prodi, jadi ia dipulangkan ke
		// prodinya sendiri (§1: yang tidak boleh diakses disembunyikan).
		const escapeTo = showTenantLink
			? '/dashboard/led-projects'
			: session?.studyProgramId
				? `/study-programs/${session.studyProgramId}`
				: null;

		return (
			<AppShell
				sidebar={{
					backTo: escapeTo,
					backLabel: showTenantLink ? 'Daftar Dokumen LED' : 'Dashboard Prodi',
					eyebrow: 'Dokumen LED',
					brand: 'Tidak ditemukan',
					items: [],
				}}
				breadcrumbs={[...tenantCrumb, { label: 'Dokumen LED tidak ditemukan' }]}
				headerAction={<RoleSwitcher />}
			>
				<PlaceholderPage
					title="Dokumen LED tidak ditemukan"
					description={`Tidak ada Dokumen LED dengan ID "${projectId}". Mungkin sudah dihapus, atau ikut terhapus bersama prodinya.`}
					links={
						escapeTo
							? [
									{
										label: showTenantLink
											? 'Lihat Dokumen LED lintas prodi'
											: 'Kembali ke Dashboard Prodi',
										to: escapeTo,
									},
								]
							: []
					}
				/>
			</AppShell>
		);
	}

	const programPath = `/study-programs/${ledProject.studyProgramId}`;

	return (
		<AppShell
			sidebar={{
				// Tujuannya prodi milik dokumen ini — bukan lapis tenant — sehingga
				// tombolnya tetap ada untuk Penyusun.
				backTo: programPath,
				backLabel: ledProject.studyProgramName,
				eyebrow: 'Dokumen LED',
				brand: ledProject.judul,
				items: [
					{
						name: 'Progres per Bab',
						path: `/led-projects/${projectId}`,
						icon: ListChecksIcon,
						end: true,
					},
				],
			}}
			breadcrumbs={[
				...tenantCrumb,
				{ to: programPath, label: ledProject.studyProgramName },
				{ to: `/led-projects/${projectId}`, label: ledProject.judul },
			]}
			headerAction={<RoleSwitcher />}
		>
			<Outlet />
		</AppShell>
	);
}
