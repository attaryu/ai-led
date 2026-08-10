import {
	DotsThreeVerticalIcon,
	PencilSimpleIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/core/components/ui/dropdown-menu';
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

/** Sisanya dibaca di §5.3 — daftar ini gunanya menunjukkan jejak, bukan mengarsip. */
export const MAX_PROGRAM_HISTORY_SHOWN = 5;

/**
 * Riwayat penyusunan Dokumen LED prodi ini (docs/application_flow.md §5.1c).
 *
 * Yang sedang disusun **ikut terdaftar** di sini, bukan dikecualikan: akreditasi
 * berjalan per prodi lintas tahun, dan penyusunan sekarang hanya bermakna kalau
 * terbaca sebagai kelanjutan yang sebelumnya. Kartu §5.1b tetap menonjolkannya —
 * baris di sini adalah tempatnya dalam urutan, bukan pengulangan.
 *
 * Sengaja `Table` polos, bukan `DataTable`: pencarian, pengurutan, dan paginasi
 * sudah punya rumahnya di §5.3, dan tautan "Lihat semua" adalah jalan ke sana.
 * Menyalin perkakasnya ke sini hanya akan membuat dua halaman yang sama.
 */
export function ProgramLedProjectHistory({
	projects,
	programId,
	canManage,
	onEdit,
	onDelete,
}: {
	projects: LedProjectEntity[];
	programId: string;
	canManage: boolean;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
}) {
	const shown = projects.slice(0, MAX_PROGRAM_HISTORY_SHOWN);
	const sisa = projects.length - shown.length;

	return (
		<section className="flex min-w-0 flex-col gap-3">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<h3 className="font-heading text-lg font-bold tracking-tight">
						Riwayat Penyusunan LED
					</h3>
					<p className="text-sm text-muted-foreground">
						Seluruh Dokumen LED prodi ini, termasuk yang sedang disusun.
					</p>
				</div>
				<Link
					to={`/study-programs/${programId}/led-projects`}
					className="text-sm text-primary underline-offset-4 hover:underline"
				>
					Lihat semua
				</Link>
			</div>

			{projects.length === 0 ? (
				<p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
					Prodi ini belum punya Dokumen LED. Dokumen baru dibuat oleh Penjamin
					Mutu lewat Dashboard Utama.
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Judul</TableHead>
							<TableHead>Tahun</TableHead>
							<TableHead>Status</TableHead>
							{/*
							 * Kolom aksi tidak dirender sama sekali untuk role yang tidak
							 * berhak (§1) — kolom kosong bertajuk "Aksi" tetap menjanjikan
							 * sesuatu yang tidak ada.
							 */}
							{canManage && <TableHead className="w-px">Aksi</TableHead>}
						</TableRow>
					</TableHeader>
					<TableBody>
						{shown.map((project) => (
							<TableRow key={project.id}>
								<TableCell>
									<Link
										to={`/led-projects/${project.id}`}
										className="font-medium text-primary underline-offset-4 hover:underline"
									>
										{project.judul}
									</Link>
								</TableCell>
								<TableCell className="whitespace-nowrap">
									{project.tahunAkademik}
								</TableCell>
								<TableCell>
									<LedProjectStatusBadge status={project.statusKeseluruhan} />
								</TableCell>
								{canManage && (
									<TableCell>
										<DropdownMenu>
											<DropdownMenuTrigger
												aria-label="Aksi lain"
												className={cn(
													buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
													'cursor-pointer',
												)}
											>
												<DotsThreeVerticalIcon className="size-4" />
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-40 bg-popover">
												<DropdownMenuItem
													className="cursor-pointer"
													onClick={() => onEdit(project.id)}
												>
													<PencilSimpleIcon className="size-4" />
													Ubah
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													className="cursor-pointer text-destructive"
													onClick={() => onDelete(project.id)}
												>
													<TrashIcon className="size-4" />
													Hapus
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			{sisa > 0 && (
				<p className="text-xs text-muted-foreground">
					…dan {sisa} dokumen lain di daftar lengkapnya.
				</p>
			)}
		</section>
	);
}
