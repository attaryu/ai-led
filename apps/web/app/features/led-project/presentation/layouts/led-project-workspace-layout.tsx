import * as React from 'react';
import {
	GaugeIcon,
	NotePencilIcon,
	SealCheckIcon,
} from '@phosphor-icons/react';
import { Navigate, Outlet, useParams } from 'react-router';

import { AppShell, type AppShellBreadcrumb } from '~/core/components/app-shell';
import { PlaceholderPage } from '~/core/components/placeholder-page';
import {
	canAccessTenant,
	useRoleGuard,
} from '~/features/auth/presentation/hooks/use-role-guard';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { useActiveTenant } from '~/features/tenant/presentation/hooks/use-active-tenant';
import { ledProjectRepository } from '../../data/repositories/led-project.repository';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';

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
	const [ledProject, setLedProject] = React.useState<
		LedProjectEntity | null | undefined
	>(undefined);

	React.useEffect(() => {
		if (!projectId) {
			setLedProject(null);
			return;
		}
		setLedProject(undefined);
		let cancelled = false;
		ledProjectRepository.findById(projectId).then((found) => {
			if (!cancelled) setLedProject(found ?? null);
		});
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	const guard = useRoleGuard('project', ledProject?.studyProgramId);

	if (guard.status === 'pending' || ledProject === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
				Memuat…
			</div>
		);
	}

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
		// Penyusun tidak berhak atas daftar lintas program studi, jadi ia dipulangkan ke
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
			>
				<PlaceholderPage
					title="Dokumen LED tidak ditemukan"
					description={`Tidak ada Dokumen LED dengan ID "${projectId}". Mungkin sudah dihapus, atau ikut terhapus bersama program studinya.`}
					links={
						escapeTo
							? [
									{
										label: showTenantLink
											? 'Lihat Dokumen LED lintas program studi'
											: 'Kembali ke Dashboard Program Studi',
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
						/*
						 * "Dashboard", bukan "Progres Dokumen": item pertama tiap ruang
						 * kerja adalah halaman ikhtisarnya, dan lapis tenant sudah
						 * menamainya begitu. Nama lamanya juga menyempit — halaman ini
						 * memuat bukti dukung terpakai dan acuan penilaian, bukan cuma
						 * progres.
						 *
						 * Ikonnya `Gauge`, bukan `House` seperti lapis tenant: rumah
						 * berarti titik awal aplikasi, dan lapis ini bukan itu.
						 */
						name: 'Dashboard',
						path: `/led-projects/${projectId}`,
						icon: GaugeIcon,
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
		>
			<Outlet context={ledProject} />
		</AppShell>
	);
}
