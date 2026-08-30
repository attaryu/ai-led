import * as React from 'react';
import { useNavigate, useParams } from 'react-router';

import { PlaceholderPage } from '~/core/components/placeholder-page';
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import { studyProgramRepository } from '../../data/repositories/study-program.repository';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';
import { ActiveProjectCard } from '../components/active-project-card';
import { ProgramAccreditationCard } from '../components/program-accreditation-card';
import { ProgramEvidencePanel } from '../components/program-evidence-panel';
import { ProgramLedProjectHistory } from '../components/program-led-project-history';
import { ProgramTeamPanel } from '../components/program-team-panel';
import { useProgramReadiness } from '../hooks/use-program-readiness';

/**
 * Dashboard Prodi (docs/application_flow.md §5.1).
 *
 * Subjek halaman ini adalah prodinya, bukan daftar dokumennya: akreditasi LAM
 * Teknik berjalan per prodi, satu dokumen pada satu waktu.
 *
 * **Aturan utama halaman ini: satu blok, satu kerangka waktu.** Dua kartu
 * teratas berdampingan justru karena kerangkanya berbeda dan perbedaan itu perlu
 * terbaca sekali pandang — kiri capaian yang sudah disahkan (masa lalu), kanan
 * usaha menuju akreditasi berikutnya (sekarang). Di bawahnya riwayat penyusunan
 * dan sumber daya prodi, keduanya lintas penyusunan.
 *
 * **Rincian penyusunan sengaja tidak ada di sini.** Kelengkapan per bab,
 * kesiapan review, bukti dukung terpakai, dan daftar hal yang perlu ditindak
 * punya rumahnya di Dashboard Project LED (§6.1); mengulangnya di lapis prodi
 * hanya membuat halaman ini jadi salinan lapis di bawahnya. Yang tersisa cuma
 * satu bar: cukup untuk tahu dokumennya bergerak atau tidak.
 *
 * Aturan "prodi ini tersendat di mana" yang dulu menggerakkan panel itu sudah
 * dihapus seluruhnya: sejak §4.0c dipecah jadi dua tabel, pemicunya berubah jadi
 * bentuk halaman — tabel Perlu Segera Disusun, kolom tenggat yang merah — bukan
 * lagi angka yang perlu dijumlahkan.
 *
 * Berbeda dari versi sebelumnya, halaman ini **punya** aksi ubah data — ubah dan
 * hapus Dokumen LED di tabel riwayat. Sesuai §1 keduanya tidak dirender sama
 * sekali di luar Penjamin Mutu, bukan sekadar dinonaktifkan.
 */
export function StudyProgramWorkspaceHome() {
	const { programId } = useParams<{ programId: string }>();
	const studyProgram = programId
		? studyProgramRepository.findById(programId)
		: undefined;

	// Layout sudah menampilkan keadaan "tidak ditemukan" dan tidak merender
	// halaman ini; cabang ini hanya penjaga bila rutenya dipakai di luar layout.
	if (!studyProgram) {
		return (
			<PlaceholderPage
				title="Prodi tidak ditemukan"
				description="Prodi yang diminta tidak ada di daftar."
				links={[
					{ label: 'Daftar Program Studi', to: '/dashboard/study-programs' },
				]}
			/>
		);
	}

	return <ProgramReadinessView program={studyProgram} />;
}

/**
 * Dipisah dari komponen di atas supaya hook kesiapan tidak perlu berjalan (dan
 * menyentuh penyimpanan) untuk prodi yang belum tentu ada.
 */
function ProgramReadinessView({ program }: { program: StudyProgramEntity }) {
	const navigate = useNavigate();
	const session = useSession();
	const {
		penyusunanAktif,
		arsip,
		chapterSummary,
		evidenceProdi,
		penyusun,
	} = useProgramReadiness(program.id);

	// Penyusunan Dokumen LED sepenuhnya wewenang Penjamin Mutu; Pimpinan read-only
	// di level ini (§6.2) dan Penyusun tidak pernah punya aksi di sini (§15).
	const canManage = session?.role === 'Penjamin Mutu';

	/** Dibawa formulir supaya Batal dan simpan memulangkan ke dashboard ini. */
	const returnTo = `/study-programs/${program.id}`;

	const handleDelete = React.useCallback((id: string) => {
		if (confirm('Apakah Anda yakin ingin menghapus Dokumen LED ini?')) {
			ledProjectRepository.delete(id);
			// Hook kesiapan berlangganan event yang sama, jadi barisnya hilang tanpa
			// halaman ini perlu memuat ulang sendiri.
			window.dispatchEvent(new Event('storage-update'));
		}
	}, []);

	const handleEdit = React.useCallback(
		(id: string) => {
			navigate(
				`/dashboard/led-projects/${id}/edit?returnTo=${encodeURIComponent(returnTo)}`,
			);
		},
		[navigate, returnTo],
	);

	/*
	 * Yang sedang disusun ikut terdaftar di riwayat, di posisi paling atas:
	 * `pickPenyusunanAktif` sudah memisahkannya dari arsip, dan menyatukannya
	 * kembali di sini membuat tabelnya terbaca sebagai urutan penuh — kartu di
	 * atas menonjolkan, tabel menempatkan.
	 */
	const riwayat = penyusunanAktif ? [penyusunanAktif, ...arsip] : arsip;

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h2 className="font-heading text-2xl font-bold tracking-tight">
					Dashboard Prodi
				</h2>
				<p className="text-sm text-muted-foreground">
					Kesiapan akreditasi {program.studyProgramName}.
				</p>
			</div>

			<div className="grid items-start gap-4 lg:grid-cols-2">
				<ProgramAccreditationCard program={program} />

				{penyusunanAktif ? (
					<ActiveProjectCard
						project={penyusunanAktif}
						summary={chapterSummary}
					/>
				) : (
					/*
					 * Dua keadaan berbeda, dua kalimat berbeda: prodi yang belum pernah
					 * punya dokumen bukan hal yang sama dengan prodi yang dokumennya sudah
					 * tuntas semua.
					 */
					<Card size="sm">
						<CardHeader>
							<CardTitle>
								{arsip.length === 0
									? 'Belum ada Dokumen LED'
									: 'Tidak ada yang sedang disusun'}
							</CardTitle>
							<CardDescription>
								{arsip.length === 0
									? 'Prodi ini belum punya Dokumen LED. Dokumen baru dibuat oleh Penjamin Mutu lewat Dashboard Utama.'
									: 'Seluruh Dokumen LED prodi ini sudah berstatus SELESAI. Penyusunan berikutnya dimulai dengan membuat Dokumen LED baru.'}
							</CardDescription>
						</CardHeader>
					</Card>
				)}
			</div>

			<div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
				<ProgramLedProjectHistory
					projects={riwayat}
					programId={program.id}
					canManage={canManage}
					onEdit={handleEdit}
					onDelete={handleDelete}
				/>

				<div className="flex flex-col gap-4">
					<ProgramEvidencePanel summary={evidenceProdi} programId={program.id} />
					<ProgramTeamPanel penyusun={penyusun} />
				</div>
			</div>
		</div>
	);
}
