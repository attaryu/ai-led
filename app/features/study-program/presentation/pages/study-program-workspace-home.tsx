import { useParams } from 'react-router';

import { PlaceholderPage } from '~/core/components/placeholder-page';
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { studyProgramRepository } from '../../data/repositories/study-program.repository';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';
import { ActiveCycleSection } from '../components/active-cycle-section';
import { CycleArchiveList } from '../components/cycle-archive-list';
import { ProgramAccreditationCard } from '../components/program-accreditation-card';
import { ProgramActivityTimeline } from '../components/program-activity-timeline';
import { ProgramAttentionPanel } from '../components/program-attention-panel';
import { ProgramEvidencePanel } from '../components/program-evidence-panel';
import { ProgramTeamPanel } from '../components/program-team-panel';
import { useProgramReadiness } from '../hooks/use-program-readiness';

/**
 * Dashboard Prodi (docs/application_flow.md §5.1).
 *
 * Subjek halaman ini adalah prodinya, bukan daftar dokumennya: akreditasi LAM
 * Teknik berjalan per prodi, satu siklus pada satu waktu.
 *
 * Halaman disusun sebagai tiga blok dengan **kerangka waktu yang berbeda**, dan
 * tiap blok menyebut kerangkanya sendiri: akreditasi yang sudah disahkan (masa
 * lalu), siklus yang sedang disusun (sekarang), lalu sumber daya dan riwayat
 * prodi (lintas siklus). Pemisahan itu yang jadi aturan utama halaman ini —
 * mencampurnya dalam satu deret kartu membuat capaian lama terbaca sebagai
 * ukuran pekerjaan yang sedang berjalan.
 *
 * Halaman ini murni baca: tidak ada aksi ubah data, jadi tidak ada yang perlu
 * disembunyikan per role (§1) — penjagaannya sudah selesai di layout lapis ini.
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
	const {
		siklusAktif,
		arsip,
		chapterSummary,
		evidenceProdi,
		buktiDukungTersedia,
		penyusun,
		attention,
		aktivitas,
	} = useProgramReadiness(program.id, program.berlakuSampaiAkreditasi);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="font-heading text-2xl font-bold tracking-tight">
					Dashboard Prodi
				</h2>
				<p className="text-sm text-muted-foreground">
					Kesiapan akreditasi {program.studyProgramName}.
				</p>
			</div>

			<ProgramAccreditationCard program={program} />

			{siklusAktif ? (
				<ActiveCycleSection
					project={siklusAktif}
					summary={chapterSummary}
					buktiDukungTersedia={buktiDukungTersedia}
				/>
			) : (
				/*
				 * Dua keadaan berbeda, dua kalimat berbeda: prodi yang belum pernah
				 * punya dokumen bukan hal yang sama dengan prodi yang siklusnya sudah
				 * tuntas semua.
				 */
				<Card>
					<CardHeader>
						<CardTitle>
							{arsip.length === 0
								? 'Belum ada Dokumen LED'
								: 'Tidak ada siklus yang berjalan'}
						</CardTitle>
						<CardDescription>
							{arsip.length === 0
								? 'Prodi ini belum punya Dokumen LED. Dokumen baru dibuat oleh Penjamin Mutu lewat Dashboard Utama.'
								: 'Seluruh Dokumen LED prodi ini sudah berstatus SELESAI. Siklus berikutnya dimulai dengan membuat Dokumen LED baru.'}
						</CardDescription>
					</CardHeader>
				</Card>
			)}

			<div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="flex min-w-0 flex-col gap-6">
					<ProgramActivityTimeline activities={aktivitas} />
					<CycleArchiveList projects={arsip} />
				</div>

				<div className="flex flex-col gap-4">
					<ProgramAttentionPanel attention={attention} />
					<ProgramEvidencePanel summary={evidenceProdi} programId={program.id} />
					<ProgramTeamPanel penyusun={penyusun} />
				</div>
			</div>
		</div>
	);
}
