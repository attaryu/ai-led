import {
	CaretRightIcon,
	LockSimpleIcon,
	NotebookIcon,
	PaperclipIcon,
	TimerIcon,
} from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import {
	StatCard,
	type StatCardTone,
} from '~/core/components/ui/stat-card';
import { formatDate, formatDayCount } from '~/core/lib/format-time';
import { type ChapterSummary } from '~/features/chapter/domain/entities/chapter.entity';
import {
	deriveDeadline,
	type DeadlineUrgency,
	type LedProjectEntity,
} from '~/features/led-project/domain/entities/led-project.entity';
import { LedProjectStatusBadge } from '~/features/led-project/presentation/components/led-project-status-badge';

const deadlineTones: Record<DeadlineUrgency, StatCardTone> = {
	AMAN: 'default',
	DEKAT: 'warning',
	LEWAT: 'danger',
};

/**
 * Siklus akreditasi yang sedang berjalan (docs/application_flow.md §5.1b).
 *
 * Seluruh angka di sini **hanya milik siklus ini** — tidak ada capaian
 * akreditasi lampau maupun akumulasi lintas siklus. Aturan itu yang membuat
 * baris ringkasan bisa dibaca sebagai satu kesatuan.
 *
 * Kepala section sekaligus menggantikan kartu hero yang dulu ada di sini:
 * judul, tahun akademik, status, dan tombol masuk sudah cukup sebagai pengantar,
 * sedangkan bar kelengkapan dan tenggat hidup di kartunya masing-masing alih-alih
 * muncul dua kali.
 */
export function ActiveCycleSection({
	project,
	summary,
	buktiDukungTersedia,
}: {
	project: LedProjectEntity;
	summary: ChapterSummary;
	buktiDukungTersedia: number;
}) {
	const tenggat = deriveDeadline(project.tenggat);

	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="min-w-0">
					<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Siklus Berjalan
					</p>
					<div className="mt-1 flex flex-wrap items-center gap-2">
						<h3 className="truncate font-heading text-lg font-bold tracking-tight">
							{project.judul}
						</h3>
						<LedProjectStatusBadge status={project.statusKeseluruhan} />
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						Tahun Akademik {project.tahunAkademik}
					</p>
				</div>

				<Link
					to={`/led-projects/${project.id}`}
					className={buttonVariants({ size: 'sm' })}
				>
					Buka Dokumen
					<CaretRightIcon className="size-4" />
				</Link>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					label="Bab Terisi"
					icon={NotebookIcon}
					value={`${summary.terisi}/${summary.total}`}
					progress={summary.persenKelengkapan}
					hint={`${summary.persenKelengkapan}% bab sudah ada isinya`}
				/>
				<StatCard
					label="Kesiapan Review"
					icon={LockSimpleIcon}
					value={`${summary.terkunci}/${summary.total}`}
					progress={
						summary.total === 0 ? 0 : (summary.terkunci / summary.total) * 100
					}
					hint={
						summary.menungguReview > 0
							? `${summary.menungguReview} bab menunggu review`
							: 'Bab yang sudah dikunci Penjamin Mutu'
					}
				/>
				<StatCard
					label="Bukti Dukung Dipakai"
					icon={PaperclipIcon}
					value={String(summary.buktiDukungTerpakai)}
					hint={`Dari ${buktiDukungTersedia} berkas tersedia untuk prodi ini`}
				/>
				{/*
				 * Dokumen tanpa tenggat dikatakan apa adanya: "—" akan terbaca sebagai
				 * tenggat yang hilang, padahal tidak dipatok memang pilihan yang sah (§14).
				 */}
				<StatCard
					label="Sisa Tenggat"
					icon={TimerIcon}
					value={tenggat ? formatDayCount(tenggat.sisaHari) : 'Tidak dipatok'}
					tone={tenggat ? deadlineTones[tenggat.urgensi] : 'default'}
					hint={
						project.tenggat
							? `Target selesai ${formatDate(project.tenggat)}`
							: 'Dokumen ini belum dipatok target selesai'
					}
				/>
			</div>
		</section>
	);
}
