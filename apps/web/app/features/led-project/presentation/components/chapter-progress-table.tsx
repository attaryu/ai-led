import { ArrowRightIcon } from '@phosphor-icons/react';
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
import {
	deriveChapterProgress,
	type ChapterEntity,
} from '~/features/chapter/domain/entities/chapter.entity';
import { formatRelativeTime } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import { ChapterStatusBadge } from './chapter-status-badge';

/**
 * Daftar bab beserta progresnya (docs/application_flow.md §6.1).
 *
 * Sengaja memakai `Table` polos, bukan `DataTable`: jumlah barisnya tetap
 * (satu struktur bab standar) dan urutannya bermakna — `urutan_bab` adalah
 * urutan dokumen akreditasi itu sendiri, jadi pengurutan ulang, pencarian, dan
 * paginasi justru menghalangi cara halaman ini dibaca.
 *
 * Aksi ke Editor Bab (§7) lewat tombol "Buka" di kolom terakhir, bukan lewat
 * baris ber-`onClick` yang tidak bisa dicapai keyboard dan tidak punya
 * href untuk dibuka di tab baru; `TableRow` sudah memberi sorotan barisnya
 * secara cuma-cuma. Bab terkunci tetap punya tombol — §12.2 memblokir aksi
 * ubah, bukan membaca.
 */
export function ChapterProgressTable({
	projectId,
	chapters,
}: {
	projectId: string;
	chapters: ChapterEntity[];
}) {
	return (
		// Lantai `min-w-3xl` bawaan Table dilepas: kolom ini memampat
		// sendiri (catatan terpotong), jadi tidak perlu menggulung di 820 px.
		<Table className="min-w-0">
			<TableHeader>
				<TableRow>
					<TableHead className="w-12 text-right">#</TableHead>
					<TableHead>Bab</TableHead>
					<TableHead className="w-40">Status</TableHead>
					<TableHead className="w-40">Terakhir Disimpan</TableHead>
					<TableHead>Catatan Penjamin Mutu</TableHead>
					<TableHead className="w-px whitespace-nowrap">Aksi</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{chapters.length === 0 ? (
					<TableRow>
						<TableCell
							colSpan={6}
							className="h-24 text-center text-muted-foreground"
						>
							Dokumen ini belum punya bab.
						</TableCell>
					</TableRow>
				) : (
					chapters.map((chapter) => (
						<TableRow key={chapter.id}>
							<TableCell className="py-2.5 text-right tabular-nums text-muted-foreground">
								{chapter.urutanBab}
							</TableCell>
							<TableCell className="py-2.5 font-medium">
								{chapter.judulBab}
							</TableCell>
							<TableCell className="py-2.5">
								<ChapterStatusBadge progress={deriveChapterProgress(chapter)} />
							</TableCell>
							<TableCell className="py-2.5 text-muted-foreground">
								{chapter.terakhirDisimpan
									? formatRelativeTime(chapter.terakhirDisimpan)
									: '—'}
							</TableCell>
							{/* `max-w-0`: teks panjang tidak ikut menentukan lebar kolom (lebarnya
							    dari `w-[30%]`); teks penuh ada di `title` dan tab Review Editor Bab. */}
							<TableCell className="w-[30%] min-w-28 max-w-0 py-2.5 text-muted-foreground">
								{chapter.catatanPenjaminMutu ? (
									<span
										className="block truncate"
										title={chapter.catatanPenjaminMutu}
									>
										{chapter.catatanPenjaminMutu}
									</span>
								) : (
									'—'
								)}
							</TableCell>
							<TableCell className="py-2.5">
								<Link
									to={`/editor/${projectId}/${chapter.id}`}
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
					))
				)}
			</TableBody>
		</Table>
	);
}
