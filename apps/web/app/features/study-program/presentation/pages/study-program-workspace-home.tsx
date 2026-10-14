import * as React from 'react';
import { useOutletContext } from 'react-router';

import { WarningCircleIcon } from '@phosphor-icons/react';

import { Card, CardDescription, CardHeader, CardTitle } from '~/core/components/ui/card';
import { summarizeChapters } from '~/features/chapter/domain/entities/chapter.entity';
import { buildActiveDocumentRows } from '~/features/dashboard/domain/entities/active-documents.entity';
import { ActiveDocumentsTable } from '~/features/dashboard/presentation/components/active-documents-table';
import { EvidenceStatusCard } from '~/features/evidence/presentation/components/evidence-status-card';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';
import { ProgramLedProjectHistory } from '../components/program-led-project-history';
import { ProgramTeamPanel } from '../components/program-team-panel';
import { useProgramAmiOverview } from '../hooks/use-program-ami-overview';
import { useProgramReadiness } from '../hooks/use-program-readiness';

/**
 * Dashboard Program Studi (docs/application_flow.md §5.1).
 *
 * Subjek halaman ini adalah prodinya, bukan daftar dokumennya: akreditasi LAM
 * Teknik berjalan per prodi, satu dokumen pada satu waktu. Satu kolom, dari atas:
 * judul + satu baris meta prodi, tabel Dokumen LED yang sedang disusun (komponen
 * yang sama dengan Dashboard Utama), status Bukti Dukung milik prodi, lalu
 * riwayat dokumen SELESAI berdampingan dengan Tim Penyusun.
 *
 * **Rincian penyusunan sengaja tidak ada di sini.** Kelengkapan per bab,
 * kesiapan review, dan daftar hal yang perlu ditindak punya rumahnya di
 * Dashboard Project LED (§6.1). Halaman ini read-only: ubah dan hapus Dokumen
 * LED ada di halaman Dokumen LED prodi.
 */
export function StudyProgramWorkspaceHome() {
	// Layout lapis ini (`StudyProgramWorkspaceLayout`) sudah mengambil prodinya
	// lewat API dan menampilkan keadaan "tidak ditemukan"/"sedang memuat"
	// sendiri sebelum merender `<Outlet>` — halaman ini tidak perlu mengambil
	// ulang datanya lewat request kedua, cukup baca dari context.
	const studyProgram = useOutletContext<StudyProgramEntity>();
	return <ProgramReadinessView program={studyProgram} />;
}

/**
 * Dipisah dari komponen di atas supaya hook kesiapan tidak perlu berjalan (dan
 * menyentuh penyimpanan) untuk prodi yang belum tentu ada.
 */
function ProgramReadinessView({ program }: { program: StudyProgramEntity }) {
	const { dokumen, evidenceProdi, penyusun } = useProgramReadiness(program.id);

	// Tiap sumber gagal sendiri; sebelum dokumen terbaca, semuanya dianggap kosong
	// tanpa ditampilkan (lihat `dokumen.status` di bawah).
	const dokumenData = dokumen.status === 'ready' ? dokumen.data : null;
	const penyusunanAktif = dokumenData?.penyusunanAktif ?? null;
	const arsip = dokumenData?.arsip ?? [];
	const tenggat = dokumenData?.tenggat ?? null;
	const chapterSummary = React.useMemo(
		() => dokumenData?.chapterSummary ?? summarizeChapters([]),
		[dokumenData],
	);

	const overviews = useProgramAmiOverview(penyusunanAktif ? [penyusunanAktif.id] : []);

	// Baris dibentuk dengan aturan yang sama dengan Dashboard Utama, hanya
	// untuk prodi ini. Ringkasan AMI yang gagal dimuat (`null`) mengosongkan
	// kolom AMI, bukan tabelnya.
	const rows = React.useMemo(
		() =>
			buildActiveDocumentRows({
				readiness: [{ program, penyusunanAktif, chapterSummary, tenggat }],
				overviews,
			}),
		[program, penyusunanAktif, chapterSummary, tenggat, overviews],
	);

	const riwayat = dokumenData
		? arsip.filter((project) => project.statusKeseluruhan === 'SELESAI')
		: null;

	const meta = [
		program.jenjang,
		program.fakultas,
		program.kode ? `Kode ${program.kode}` : '',
		program.ketuaProdi ? `Ketua Program Studi: ${program.ketuaProdi}` : '',
	]
		.filter(Boolean)
		.join(' · ');

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h2 className="font-heading text-2xl font-bold tracking-tight">
					{program.studyProgramName}
				</h2>
				<p className="text-sm text-muted-foreground">{meta}</p>
			</div>

			<section className="flex flex-col gap-3">
				<h3 className="font-heading text-lg font-bold tracking-tight">
					Dokumen LED
				</h3>
				{dokumen.status === 'error' ? (
					<p className="flex items-start gap-2 text-sm text-destructive">
						<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
						Gagal memuat Dokumen LED.
					</p>
				) : dokumen.status === 'loading' ? null : penyusunanAktif ? (
					<ActiveDocumentsTable
						rows={rows}
						amiTersedia={overviews !== null}
						kolomPertama="judul"
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
									? 'Program studi ini belum punya Dokumen LED. Dokumen baru dibuat oleh Penjamin Mutu lewat Dashboard Utama.'
									: 'Seluruh Dokumen LED program studi ini sudah berstatus SELESAI. Penyusunan berikutnya dimulai dengan membuat Dokumen LED baru.'}
							</CardDescription>
						</CardHeader>
					</Card>
				)}
			</section>

			{/* Hanya berkas milik prodi, sama dengan isi perpustakaan yang dituju tombolnya. */}
			<EvidenceStatusCard
				judul="Bukti Dukung Program Studi"
				ringkasan={evidenceProdi.status === 'ready' ? evidenceProdi.data : null}
				href={`/study-programs/${program.id}/evidence`}
				pesanKosong="Belum ada berkas milik program studi ini."
				galat={evidenceProdi.status === 'error' ? 'Gagal memuat bukti dukung.' : undefined}
			/>

			<div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
				<ProgramLedProjectHistory
					projects={riwayat}
					programId={program.id}
					galat={dokumen.status === 'error'}
				/>
				<ProgramTeamPanel
					penyusun={penyusun.status === 'ready' ? penyusun.data : null}
					galat={penyusun.status === 'error'}
				/>
			</div>
		</div>
	);
}
