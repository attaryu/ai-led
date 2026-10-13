import { CaretRightIcon, TimerIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import { Card, CardContent } from '~/core/components/ui/card';
import { formatDate, formatDayCount } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import { type ChapterSummary } from '~/features/chapter/domain/entities/chapter.entity';
import {
	deriveDeadline,
	type DeadlineUrgency,
	type LedProjectEntity,
} from '~/features/led-project/domain/entities/led-project.entity';
import { ChapterProgressBar } from '~/features/led-project/presentation/components/chapter-progress-bar';
import { LedProjectStatusBadge } from '~/features/led-project/presentation/components/led-project-status-badge';

const deadlineStyles: Record<DeadlineUrgency, string> = {
	AMAN: 'text-muted-foreground',
	DEKAT: 'text-amber-700 dark:text-amber-400',
	LEWAT: 'text-destructive',
};

/**
 * Dokumen LED yang sedang disusun program studi ini (docs/application_flow.md §5.1b).
 *
 * Bentuknya sengaja satu kartu sederajat dengan `ProgramIdentityCard`:
 * keduanya berdampingan dua kolom, dan yang kiri menjawab "program studi apa ini"
 * sementara yang kanan menjawab "usaha menuju akreditasi berikutnya sudah
 * sejauh mana". Dua pertanyaan, dua kartu, satu pandangan.
 *
 * **Kartu ini bukan tempat rincian.** Versi sebelumnya membongkar empat kartu
 * angka di sini — kelengkapan bab, kesiapan review, bukti dukung terpakai, sisa
 * tenggat — sehingga Dashboard Program Studi jadi salinan Dashboard Project LED (§6.1)
 * dan kehilangan subjeknya sendiri. Sekarang yang tersisa hanya penanda apakah
 * dokumennya bergerak; siapa pun yang butuh lebih dalam menekan Lihat Detail.
 */
export function ActiveProjectCard({
	project,
	summary,
}: {
	project: LedProjectEntity;
	summary: ChapterSummary;
}) {
	const tenggat = deriveDeadline(project.tenggat);

	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-4">
				<div className="min-w-0">
					<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Penyusunan Berjalan
					</p>
					<div className="mt-1 flex flex-wrap items-center gap-2">
						<h3 className="truncate font-heading text-lg font-bold tracking-tight">
							{project.judul}
						</h3>
						<LedProjectStatusBadge status={project.statusKeseluruhan} />
					</div>

					<div className="mt-1 flex gap-6">
						<p className="text-sm text-muted-foreground">
							Tahun Akademik {project.tahunAkademik}
						</p>
						{/*
						* Dokumen tanpa tenggat dikatakan apa adanya: "—" akan terbaca sebagai
						* tenggat yang hilang, padahal tidak dipatok memang pilihan yang sah
						* (§14).
						*/}
						<p
							className={cn(
								'flex items-center gap-1.5 text-sm',
								tenggat ? deadlineStyles[tenggat.urgensi] : 'text-muted-foreground',
							)}
						>
							<TimerIcon className="size-4 shrink-0" weight="duotone" />
							{project.tenggat
								? `Tenggat ${formatDate(project.tenggat)} · ${formatDayCount(tenggat!.sisaHari)}`
								: 'Tenggat tidak dipatok'}
						</p>
					</div>
				</div>

				<div className="flex flex-col gap-2 border-t border-border pt-3">
					<div className="flex items-baseline justify-between gap-2 text-sm">
						<span className="font-medium">Kelengkapan Bab</span>
						<span className="tabular-nums text-muted-foreground">
							{summary.terisi}/{summary.total}
						</span>
					</div>
					<ChapterProgressBar summary={summary} />
				</div>

				<Link
					to={`/led-projects/${project.id}`}
					className={cn(buttonVariants({ size: 'sm' }), 'self-start')}
				>
					Lihat Detail
					<CaretRightIcon className="size-4" />
				</Link>
			</CardContent>
		</Card>
	);
}
