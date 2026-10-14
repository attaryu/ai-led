import {
	ArrowRightIcon,
	LockSimpleIcon,
	NotebookIcon,
	PaperclipIcon,
} from '@phosphor-icons/react';
import { Link, useOutletContext } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import { StatCard } from '~/core/components/ui/stat-card';
import { cn } from '~/core/lib/utils';
import { ProjectAccreditationSetCard } from '~/features/accreditation-set/presentation/components/project-accreditation-set-card';
import { useDocumentAmiOverview } from '~/features/assessment/presentation/hooks/use-document-ami-overview';
import { ChapterProgressTable } from '../components/chapter-progress-table';
import { LedProjectStatusBadge } from '../components/led-project-status-badge';
import { ProjectAmiCards } from '../components/project-ami-cards';
import { useProjectProgress } from '../hooks/use-project-progress';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';

/**
 * Dashboard Dokumen — lapis Dokumen LED (docs/application_flow.md §6.1).
 *
 * Urutannya: judul dokumen beserta status dan tautan Bukti Dukung, statistik,
 * kartu Acuan Penilaian dengan dua kartu AMI (skor dan progres), lalu tabel
 * Progres per Bab selebar penuh. Kartu AMI hanya muncul bagi role yang boleh
 * membaca ringkasannya. Satu-satunya aksi ubah data di sini adalah memilih/
 * mengganti acuan penilaian, dan penjagaannya ada di kartunya. Tombol Buka di
 * tabel (bab maupun sub-bab) menuju Editor Bab (§7), yang berdiri sebagai root URL sendiri di
 * `/editor/:projectId/:chapterId`.
 *
 * `ledProject` diambil dari layout (`LedProjectWorkspaceLayout`) lewat outlet
 * context, bukan lookup terpisah — layout itu juga yang sudah menampilkan
 * keadaan "tidak ditemukan"/"sedang memuat" sebelum merender `<Outlet>`.
 */
export function LedProjectWorkspaceHome() {
	const ledProject = useOutletContext<LedProjectEntity>();
	return <ProjectProgressView ledProject={ledProject} />;
}

/**
 * Dipisah dari komponen di atas supaya hook progres tidak perlu berjalan (dan
 * menyentuh penyimpanan) untuk dokumen yang belum tentu ada.
 */
function ProjectProgressView({ ledProject }: { ledProject: LedProjectEntity }) {
	const ami = useDocumentAmiOverview(ledProject.id);
	const { chapters, summary, buktiDukungTersedia } =
		useProjectProgress(ledProject.id, ledProject.studyProgramId);

	return (
		<div className="flex flex-col gap-8">
			<div>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<h2 className="min-w-0 truncate font-heading text-2xl font-bold tracking-tight">
						{ledProject.judul}
					</h2>
					<LedProjectStatusBadge status={ledProject.statusKeseluruhan} />
					<Link
						to={`/study-programs/${ledProject.studyProgramId}/evidence`}
						className={cn(
							buttonVariants({ variant: 'outline', size: 'sm' }),
							'ml-auto',
						)}
					>
						Bukti Dukung
						<ArrowRightIcon className="size-4" />
					</Link>
				</div>
				<p className="text-sm text-muted-foreground">
					Tahun Akademik {ledProject.tahunAkademik} · Sejauh mana dokumen ini
					sudah tersusun, bab demi bab.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-3">
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
					// Antrean menumpang hint kartu ini alih-alih jadi kartu sendiri:
					// pertanyaannya ("ada yang menunggu
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
			</div>

			{/*
			 * Tiga kolom dipesan sejak kartu AMI masih dimuat, supaya kartu Acuan
			 * tidak melompat saat datanya tiba. Role tanpa hak baca ringkasan AMI
			 * (atau ringkasan yang gagal) hanya punya kartu Acuan, yang lalu
			 * mengisi baris penuh.
			 */}
			<div
				className={cn(
					'grid grid-cols-1 gap-4',
					ami.status !== 'tersembunyi' && 'md:grid-cols-3',
				)}
			>
				<ProjectAccreditationSetCard project={ledProject} />
				<ProjectAmiCards projectId={ledProject.id} ami={ami} />
			</div>

			{/*
			 * Tabelnya diberi judul sendiri karena judul halaman sudah bicara di
			 * level dokumen. `min-w-0` supaya tabel lebar menggulung di kotaknya
			 * sendiri, bukan mendorong halaman.
			 */}
			<section className="flex min-w-0 flex-col gap-2">
				<h3 className="font-heading text-base font-medium">Progres per Bab</h3>
				<ChapterProgressTable projectId={ledProject.id} chapters={chapters} />
			</section>
		</div>
	);
}
