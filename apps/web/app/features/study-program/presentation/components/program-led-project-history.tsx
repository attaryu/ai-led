import { ArrowRightIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/core/components/ui/table';
import { cn } from '~/core/lib/utils';
import { type LedProjectEntity } from '~/features/led-project/domain/entities/led-project.entity';
import { LedProjectStatusBadge } from '~/features/led-project/presentation/components/led-project-status-badge';

const cellPad = 'px-3';

/** Sisanya dibaca di §5.3 — daftar ini gunanya menunjukkan jejak, bukan mengarsip. */
export const MAX_PROGRAM_HISTORY_SHOWN = 5;

/**
 * Riwayat penyusunan Dokumen LED program studi ini (docs/application_flow.md §5.1c).
 *
 * Hanya dokumen yang sudah SELESAI: yang sedang disusun punya tempatnya sendiri
 * di tabel Dokumen LED di atasnya. Ubah dan hapus tidak ada di sini, itu
 * wewenang halaman Dokumen LED.
 *
 * Sengaja `Table` polos, bukan `DataTable`: pencarian, pengurutan, dan paginasi
 * sudah punya rumahnya di §5.3, dan tautan "Lihat semua" adalah jalan ke sana.
 */
export function ProgramLedProjectHistory({
	projects,
	programId,
	galat = false,
}: {
	/** Sudah terurut terbaru di atas dan hanya yang SELESAI; `null` selama belum dimuat. */
	projects: LedProjectEntity[] | null;
	programId: string;
	/** Gagal dimuat; berbeda dari belum ada dokumen yang selesai. */
	galat?: boolean;
}) {
	const shown = (projects ?? []).slice(0, MAX_PROGRAM_HISTORY_SHOWN);

	return (
		<section className="flex min-w-0 flex-col gap-3">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<h3 className="font-heading text-lg font-bold tracking-tight">
					Riwayat Penyusunan LED
				</h3>
				<Link
					to={`/study-programs/${programId}/led-projects`}
					className="text-sm text-primary underline-offset-4 hover:underline"
				>
					Lihat semua
				</Link>
			</div>

			{galat ? (
				<p className="flex items-start gap-2 rounded-md border border-border p-4 text-sm text-destructive">
					<WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
					Gagal memuat riwayat Dokumen LED.
				</p>
			) : projects === null ? null : shown.length === 0 ? (
				<p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
					Belum ada Dokumen LED yang selesai.
				</p>
			) : (
				<Table className="min-w-0">
					<TableHeader>
						<TableRow>
							<TableHead className={cellPad}>Judul</TableHead>
							<TableHead className={cellPad}>Tahun</TableHead>
							<TableHead className={cellPad}>Status</TableHead>
							<TableHead className={cn(cellPad, 'w-px')}>Aksi</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{shown.map((project) => (
							<TableRow key={project.id}>
								<TableCell className={cellPad}>
									<Link
										to={`/led-projects/${project.id}`}
										className="font-medium hover:underline"
									>
										{project.judul}
									</Link>
								</TableCell>
								<TableCell className={cn(cellPad, 'whitespace-nowrap')}>
									{project.tahunAkademik}
								</TableCell>
								<TableCell className={cellPad}>
									<LedProjectStatusBadge status={project.statusKeseluruhan} />
								</TableCell>
								<TableCell className={cellPad}>
									<Link
										to={`/led-projects/${project.id}`}
										className={cn(
											buttonVariants({ variant: 'outline', size: 'sm' }),
											'whitespace-nowrap',
										)}
									>
										Buka
										<ArrowRightIcon className="size-4" />
									</Link>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</section>
	);
}
