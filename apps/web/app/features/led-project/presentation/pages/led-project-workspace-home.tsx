import {
	ClockCounterClockwiseIcon,
	LockSimpleIcon,
	NotebookIcon,
	PaperclipIcon,
} from '@phosphor-icons/react';
import { useParams } from 'react-router';

import { PlaceholderPage } from '~/core/components/placeholder-page';
import { ProjectAccreditationSetBadge } from '~/features/accreditation-set/presentation/components/project-accreditation-set-badge';
import { ProjectAccreditationSetCard } from '~/features/accreditation-set/presentation/components/project-accreditation-set-card';
import { StatCard } from '~/core/components/ui/stat-card';
import { formatRelativeTime } from '~/core/lib/format-time';
import { ledProjectRepository } from '../../data/repositories/led-project.repository';
import { ChapterProgressTable } from '../components/chapter-progress-table';
import { ProjectAttentionPanel } from '../components/project-attention-panel';
import { useProjectProgress } from '../hooks/use-project-progress';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';

/**
 * Dashboard Dokumen — lapis Dokumen LED (docs/application_flow.md §6.1).
 *
 * Hampir seluruhnya baca. Satu-satunya aksi ubah data di sini adalah memilih
 * acuan penilaian dokumen, dan penjagaan per role (§1) untuk aksi itu hidup di
 * dalam panelnya sendiri, bukan di halaman ini — sisanya tetap tanpa penjagaan
 * karena penjagaan lapisnya sudah selesai di layout. Judul bab di tabel
 * menautkan ke Editor Bab (§7), yang berdiri sebagai root URL sendiri di
 * `/editor/:projectId/:chapterId`.
 */
export function LedProjectWorkspaceHome() {
	const { projectId } = useParams<{ projectId: string }>();
	const ledProject = projectId
		? ledProjectRepository.findById(projectId)
		: undefined;

	// Layout sudah menampilkan keadaan "tidak ditemukan" dan tidak merender
	// halaman ini; cabang ini hanya penjaga bila rutenya dipakai di luar layout.
	if (!ledProject) {
		return (
			<PlaceholderPage
				title="Dokumen LED tidak ditemukan"
				description="Dokumen yang diminta tidak ada di daftar."
				links={[
					{ label: 'Dokumen LED lintas program studi', to: '/dashboard/led-projects' },
				]}
			/>
		);
	}

	return <ProjectProgressView ledProject={ledProject} />;
}

/**
 * Dipisah dari komponen di atas supaya hook progres tidak perlu berjalan (dan
 * menyentuh penyimpanan) untuk dokumen yang belum tentu ada.
 */
function ProjectProgressView({ ledProject }: { ledProject: LedProjectEntity }) {
	const { chapters, summary, attention, buktiDukungTersedia } =
		useProjectProgress(ledProject.id, ledProject.studyProgramId);

	return (
		<div className="flex flex-col gap-8">
			<div>
				{/* Acuan penilaian menentukan arti seluruh angka di halaman ini, jadi
				    ia harus terbaca tanpa menggulung — tapi cukup sebagai lencana
				    sebaris judul. Rincian dan tempat menggantinya ada di kartu pada
				    kolom kanan, karena keduanya jarang dibutuhkan. */}
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Dashboard Dokumen
					</h2>
					<ProjectAccreditationSetBadge project={ledProject} />
				</div>
				<p className="text-sm text-muted-foreground">
					Sejauh mana dokumen ini sudah tersusun, bab demi bab.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					label="Kelengkapan Bab"
					icon={NotebookIcon}
					value={`${summary.terisi}/${summary.total}`}
					progress={summary.persenKelengkapan}
					hint={`${summary.persenKelengkapan}% bab sudah ada isinya`}
				/>
				<StatCard
					label="Kesiapan Review"
					icon={LockSimpleIcon}
					value={`${summary.terkunci}/${summary.total}`}
					progress={summary.persenKesiapanReview}
					// Antrean menumpang hint kartu ini alih-alih jadi kartu kelima:
					// grid-nya sudah penuh, dan pertanyaannya ("ada yang menunggu
					// saya?") memang lanjutan langsung dari angka di atasnya.
					hint={
						summary.menungguReview > 0
							? `${summary.persenKesiapanReview}% terkunci · ${summary.menungguReview} bab menunggu review`
							: `${summary.persenKesiapanReview}% bab sudah dikunci Penjamin Mutu`
					}
				/>
				<StatCard
					label="Bukti Dukung Dipakai"
					icon={PaperclipIcon}
					value={String(summary.buktiDukungTerpakai)}
					hint={`Dari ${buktiDukungTersedia} berkas tersedia untuk program studi ini`}
				/>
				<StatCard
					label="Aktivitas Terakhir"
					icon={ClockCounterClockwiseIcon}
					value={
						summary.terakhirDisimpan
							? formatRelativeTime(summary.terakhirDisimpan)
							: '—'
					}
					hint={
						summary.babTerakhirDisentuh ?? 'Belum ada bab yang pernah disimpan'
					}
				/>
			</div>

			{/*
			 * `minmax(0,1fr)` juga di lebar dasar, bukan hanya di `xl`. Tanpa itu
			 * track satu kolomnya memakai `auto`, yang berarti "selebar min-content
			 * anak terlebar" — dan track boleh melampaui wadahnya. Di 360 px itu
			 * membuat seluruh baris ini meluber 31 px walau tiap anaknya sudah
			 * `min-w-0`: yang meluber tracknya, bukan anaknya.
			 */}
			<div className="grid items-start gap-4 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_20rem]">
				{/*
				 * Tabelnya diberi judul sendiri karena judul halaman sudah bicara di
				 * level dokumen — tanpa ini ia jadi satu-satunya bagian tanpa label
				 * di antara kartu-kartu di sampingnya.
				 */}
				<section className="flex min-w-0 flex-col gap-2">
					<h3 className="font-heading text-base font-medium">Progres per Bab</h3>
					<ChapterProgressTable projectId={ledProject.id} chapters={chapters} />
				</section>
				<div className="flex min-w-0 flex-col gap-4">
					<ProjectAttentionPanel project={ledProject} attention={attention} />
					<ProjectAccreditationSetCard project={ledProject} />
				</div>
			</div>
		</div>
	);
}
