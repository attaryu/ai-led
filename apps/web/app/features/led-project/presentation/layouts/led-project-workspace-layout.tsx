import {
	ListChecksIcon,
	NotePencilIcon,
	SealCheckIcon,
} from '@phosphor-icons/react';
import { Navigate, Outlet, useParams } from 'react-router';

import { AppShell, type AppShellBreadcrumb } from '~/core/components/app-shell';
import { PlaceholderPage } from '~/core/components/placeholder-page';
import { RoleSwitcher } from '~/features/auth/presentation/components/role-switcher';
import {
	canAccessTenant,
	useRoleGuard,
} from '~/features/auth/presentation/hooks/use-role-guard';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { useActiveTenant } from '~/features/tenant/presentation/hooks/use-active-tenant';
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
	const tenant = useActiveTenant();
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
					universityName: tenant.universityName,
					backTo: escapeTo,
					eyebrow: 'Dokumen LED',
					contextTitle: 'Tidak ditemukan',
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
				universityName: tenant.universityName,
				// Tujuannya prodi milik dokumen ini — bukan lapis tenant — sehingga
				// tombolnya tetap ada untuk Penyusun.
				backTo: programPath,
				eyebrow: 'Dokumen LED',
				contextTitle: ledProject.judul,
				items: [
					{
						name: 'Progres Dokumen',
						path: `/led-projects/${projectId}`,
						icon: ListChecksIcon,
						end: true,
					},
					{
						// Penilaian AMI ada di lapis ini — bukan di prodi, bukan pula di
						// dalam editor — karena `AssessmentSession.dokumenId` menunjuk
						// `DokumenLed`: satu sesi menilai satu dokumen utuh.
						//
						// Tanpa `end`: sesi yang dilihat dan tab yang aktif hidup di query
						// string, jadi seluruh keadaan halaman ini tetap satu path yang
						// sama — pencocokan persis tidak menambah apa pun, dan rute anak
						// yang perlu dibedakan darinya memang tidak ada.
						name: 'Penilaian AMI',
						path: `/led-projects/${projectId}/assessment`,
						icon: SealCheckIcon,
					},
					{
						// Menuju bab default (§7.1) lewat `/editor/:projectId` alih-alih
						// menyusun id babnya di sini: aturan "bab mana" hidup di
						// `pickDefaultChapter`, dan tautan tanpa id bab tidak bisa jadi
						// basi saat bab dimaterialisasi ulang di localStorage.
						//
						// NavLink ini tidak akan pernah tampil aktif — Editor Bab root URL
						// sendiri, jadi begitu dibuka, layout ini sudah tidak terpasang.
						// Disengaja: sama seperti tombol kembali di atas, ini berpindah
						// lapis, bukan berpindah menu.
						name: 'Editor Dokumen',
						path: `/editor/${projectId}`,
						icon: NotePencilIcon,
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
