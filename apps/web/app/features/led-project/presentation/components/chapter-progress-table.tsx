import { PaperclipIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

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
import { ChapterStatusBadge } from './chapter-status-badge';

/**
 * Daftar bab beserta progresnya (docs/application_flow.md §6.1).
 *
 * Sengaja memakai `Table` polos, bukan `DataTable`: jumlah barisnya tetap
 * (satu struktur bab standar) dan urutannya bermakna — `urutan_bab` adalah
 * urutan dokumen akreditasi itu sendiri, jadi pengurutan ulang, pencarian, dan
 * paginasi justru menghalangi cara halaman ini dibaca.
 *
 * Judul bab jadi tautan ke Editor Bab (§7). Yang ditautkan judulnya, bukan
 * seluruh baris: baris ber-`onClick` tidak bisa dicapai keyboard dan tidak punya
 * href untuk dibuka di tab baru, sementara `TableRow` sudah memberi sorotan
 * barisnya secara cuma-cuma. Bab terkunci tetap ditautkan — §12.2 memblokir aksi
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
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-12 text-right">#</TableHead>
					<TableHead>Bab</TableHead>
					<TableHead className="w-40">Status</TableHead>
					<TableHead className="w-32 whitespace-nowrap">Bukti Dukung</TableHead>
					<TableHead className="w-40">Terakhir Disimpan</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{chapters.length === 0 ? (
					<TableRow>
						<TableCell
							colSpan={5}
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
								<Link
									to={`/editor/${projectId}/${chapter.id}`}
									className="hover:text-sidebar-primary hover:underline"
								>
									{chapter.judulBab}
								</Link>
							</TableCell>
							<TableCell className="py-2.5">
								<ChapterStatusBadge progress={deriveChapterProgress(chapter)} />
							</TableCell>
							<TableCell className="py-2.5">
								{chapter.buktiDukung.length === 0 ? (
									<span className="text-muted-foreground">—</span>
								) : (
									<span className="inline-flex items-center gap-1.5 text-muted-foreground">
										<PaperclipIcon className="size-4" />
										<span className="tabular-nums">
											{chapter.buktiDukung.length}
										</span>
									</span>
								)}
							</TableCell>
							<TableCell className="py-2.5 text-muted-foreground">
								{chapter.terakhirDisimpan
									? formatRelativeTime(chapter.terakhirDisimpan)
									: '—'}
							</TableCell>
						</TableRow>
					))
				)}
			</TableBody>
		</Table>
	);
}
