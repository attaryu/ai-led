import { ArrowRightIcon, CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import * as React from 'react';
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
import {
	buildSectionTree,
	deriveSectionProgress,
	deriveSectionRowHint,
	isPureContainer,
	type SectionNode,
} from '~/features/chapter/domain/entities/section-overview.entity';
import { formatDate } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import { ChapterStatusBadge } from './chapter-status-badge';

const BUKA_CLASS = cn(
	buttonVariants({ variant: 'outline', size: 'sm' }),
	'whitespace-nowrap',
);

/**
 * Daftar bab beserta progresnya (docs/application_flow.md §6.1), dengan
 * sub-bab yang bisa dibuka di bawah tiap bab.
 *
 * Sengaja memakai `Table` polos, bukan `DataTable`: urutannya bermakna
 * (`urutan_bab` adalah urutan dokumen akreditasi itu sendiri), jadi pengurutan
 * ulang, pencarian, dan paginasi justru menghalangi cara halaman ini dibaca.
 *
 * Catatan Penjamin Mutu hanya hidup di tingkat sub-bab (§12.2), jadi baris bab
 * membiarkan selnya kosong. Sub-bab disusun rekursif dari `parentId`, sehingga
 * kedalaman berapa pun ikut terindentasi tanpa mengandalkan penomorannya.
 *
 * Aksi ke Editor Bab (§7) lewat tombol "Buka" di kolom terakhir, bukan baris
 * ber-`onClick` yang tidak bisa dicapai keyboard. Bab/sub-bab terkunci tetap
 * punya tombol — §12.2 memblokir aksi ubah, bukan membaca.
 */
export function ChapterProgressTable({
	projectId,
	chapters,
}: {
	projectId: string;
	chapters: ChapterEntity[];
}) {
	const [terbuka, setTerbuka] = React.useState<Set<string>>(() => new Set());

	const toggle = (id: string) =>
		setTerbuka((prev) => {
			const next = new Set(prev);
			if (!next.delete(id)) next.add(id);
			return next;
		});

	return (
		// Lantai `min-w-3xl` bawaan Table dilepas: kolom catatan memampat
		// sendiri (terpotong), jadi tidak perlu menggulung di 820 px.
		<Table className="min-w-0">
			<TableHeader>
				<TableRow>
					<TableHead className="w-12 text-right">#</TableHead>
					<TableHead>Bab</TableHead>
					<TableHead className="w-44">Status</TableHead>
					<TableHead className="w-[30%]">Catatan Penjamin Mutu</TableHead>
					<TableHead className="w-px whitespace-nowrap">Aksi</TableHead>
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
					chapters.map((chapter) => {
						const terbukaIni = terbuka.has(chapter.id);
						const punyaSubBab = chapter.sections.length > 0;

						return (
							<React.Fragment key={chapter.id}>
								<TableRow>
									<TableCell className="py-2.5 text-right tabular-nums text-muted-foreground">
										{chapter.urutanBab}
									</TableCell>
									<TableCell className="py-2.5 font-medium">
										<div className="flex items-center gap-1.5">
											{/* Lebar tombol selalu dipesan agar judul bab sejajar. */}
											<span className="flex size-6 shrink-0 items-center justify-center">
												{punyaSubBab && (
													<button
														type="button"
														onClick={() => toggle(chapter.id)}
														aria-expanded={terbukaIni}
														aria-label={
															terbukaIni ? 'Tutup sub-bab' : 'Buka sub-bab'
														}
														className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
													>
														{terbukaIni ? (
															<CaretDownIcon className="size-4" />
														) : (
															<CaretRightIcon className="size-4" />
														)}
													</button>
												)}
											</span>
											{chapter.judulBab}
										</div>
									</TableCell>
									<TableCell className="py-2.5">
										<ChapterStatusBadge
											progress={deriveChapterProgress(chapter)}
										/>
									</TableCell>
									<TableCell className="py-2.5" />
									<TableCell className="py-2.5">
										<Link
											to={`/editor/${projectId}/${chapter.id}`}
											className={BUKA_CLASS}
										>
											Buka
											<ArrowRightIcon className="size-4" />
										</Link>
									</TableCell>
								</TableRow>
								{terbukaIni &&
									buildSectionTree(chapter.sections).map((node) => (
										<SectionRows
											key={node.section.id}
											node={node}
											projectId={projectId}
											chapterId={chapter.id}
										/>
									))}
							</React.Fragment>
						);
					})
				)}
			</TableBody>
		</Table>
	);
}

/** Satu sub-bab beserta seluruh keturunannya, rekursif. */
function SectionRows({
	node,
	projectId,
	chapterId,
}: {
	node: SectionNode;
	projectId: string;
	chapterId: string;
}) {
	const { section, depth } = node;
	const wadah = isPureContainer(node);
	const judul = section.marker
		? `${section.marker} ${section.judul}`
		: section.judul;
	const catatan = section.catatanPenjaminMutu;
	// Hanya petunjuk baris: lencana status tetap mengikuti progres penulisan.
	const petunjuk = wadah ? 'normal' : deriveSectionRowHint(section);
	const keteranganJudul =
		petunjuk === 'dibangkitkan'
			? 'Sedang dibangkitkan'
			: petunjuk === 'gagal'
				? `Gagal dibangkitkan${section.error ? `: ${section.error}` : ''}`
				: undefined;
	const penulis = section.catatanOlehNama ? `${section.catatanOlehNama} · ` : '';
	const tanggal = section.catatanPada ? `${formatDate(section.catatanPada)}: ` : '';

	return (
		<>
			<TableRow
				className={cn(
					'bg-muted/20',
					petunjuk === 'gagal' && 'bg-destructive/5 hover:bg-destructive/10',
				)}
			>
				<TableCell className="py-2.5" />
				<TableCell
					className="py-2.5"
					// Bantalan sel (1.25rem) + tombol buka-tutup bab beserta jaraknya
					// (1.875rem) = awal judul bab; tiap tingkat menjorok 1.25rem lagi.
					style={{ paddingLeft: `${3.125 + (depth + 1) * 1.25}rem` }}
				>
					<span
						title={keteranganJudul}
						className={cn(petunjuk === 'dibangkitkan' && 'text-muted-foreground')}
					>
						{judul}
						{petunjuk === 'dibangkitkan' && (
							<span className="sr-only"> (sedang dibangkitkan)</span>
						)}
						{petunjuk === 'gagal' && (
							<span className="sr-only"> (gagal dibangkitkan)</span>
						)}
					</span>
				</TableCell>
				<TableCell className="py-2.5">
					{!wadah && (
						<ChapterStatusBadge
							progress={deriveSectionProgress(section)}
						/>
					)}
				</TableCell>
				<TableCell className="max-w-0 truncate py-2.5 text-muted-foreground">
					{wadah ? null : catatan ? (
						<span
							title={`${penulis}${tanggal}${catatan}`}
							className="text-foreground"
						>
							{catatan}
						</span>
					) : (
						'—'
					)}
				</TableCell>
				<TableCell className="py-2.5">
					<Link
						to={`/editor/${projectId}/${chapterId}/${section.id}`}
						className={BUKA_CLASS}
					>
						Buka
						<ArrowRightIcon className="size-4" />
					</Link>
				</TableCell>
			</TableRow>
			{node.children.map((child) => (
				<SectionRows
					key={child.section.id}
					node={child}
					projectId={projectId}
					chapterId={chapterId}
				/>
			))}
		</>
	);
}
