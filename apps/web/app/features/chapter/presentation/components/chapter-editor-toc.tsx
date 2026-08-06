import { CaretRightIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { cn } from '~/core/lib/utils';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import {
	CHAPTER_TOC,
	findChapterForTocNode,
	findTocPathForChapter,
	type ChapterTocNode,
} from '../../domain/entities/chapter-toc.entity';

/**
 * Sidebar kiri Editor Bab — Daftar Isi (docs/application_flow.md §7.1).
 *
 * Pohonnya mock statis (lihat `chapter-toc.entity.ts`). Dua hal yang berbeda
 * dilakukan simpul yang punya anak, dan keduanya sengaja dipisah:
 *
 * - **Caret** membentangkan/menutup cabangnya, tanpa berpindah bab.
 * - **Label** berpindah bab, tapi hanya untuk simpul yang punya `urutanBab`.
 *
 * Simpul struktural (tanpa bab) tidak punya tujuan, jadi labelnya ikut jadi
 * pemicu buka-tutup — kalau tidak, satu-satunya sasaran kliknya cuma ikon 12 px.
 *
 * Simpul terdalam sengaja belum bisa diklik walau di rancangan ia terlihat
 * seperti bisa: penggulungan ke bagian dalam butuh heading di dalam
 * `kontenKerja` untuk dituju, dan dokumen bab yang baru belum punya satu pun —
 * tautan yang menggulung ke mana-mana lebih buruk daripada teks biasa. Begitu
 * penomoran bagian resmi ada (Pertanyaan Terbuka #2, §16), simpul-simpul itu
 * tinggal diberi anchor.
 *
 * Status terbentang dipegang halaman editor, bukan komponen ini — alasannya di
 * `chapter-editor.tsx`.
 */
export function ChapterEditorToc({
	projectId,
	chapters,
	chapterAktif,
	terbentang,
	onToggle,
}: {
	projectId: string;
	chapters: ChapterEntity[];
	chapterAktif: ChapterEntity;
	terbentang: ReadonlySet<string>;
	onToggle: (id: string) => void;
}) {
	const jalurAktif = new Set(
		findTocPathForChapter(chapterAktif.urutanBab).map((node) => node.id),
	);

	return (
		<aside className="w-72 shrink-0 overflow-y-auto border-r border-border bg-background">
			<div className="px-5 py-4">
				<h2 className="font-heading text-sm font-bold tracking-tight">
					Daftar Isi
				</h2>
			</div>

			<nav className="space-y-0.5 px-2 pb-8">
				{CHAPTER_TOC.map((node) => (
					<TocNode
						key={node.id}
						node={node}
						depth={0}
						projectId={projectId}
						chapters={chapters}
						chapterAktifId={chapterAktif.id}
						jalurAktif={jalurAktif}
						terbentang={terbentang}
						onToggle={onToggle}
					/>
				))}
			</nav>
		</aside>
	);
}

function TocNode({
	node,
	depth,
	projectId,
	chapters,
	chapterAktifId,
	jalurAktif,
	terbentang,
	onToggle,
}: {
	node: ChapterTocNode;
	depth: number;
	projectId: string;
	chapters: ChapterEntity[];
	chapterAktifId: string;
	jalurAktif: Set<string>;
	terbentang: ReadonlySet<string>;
	onToggle: (id: string) => void;
}) {
	const chapter = findChapterForTocNode(node, chapters);
	const isAktif = chapter?.id === chapterAktifId;
	const diJalurAktif = jalurAktif.has(node.id);
	const punyaAnak = node.children.length > 0;
	const terbuka = punyaAnak && terbentang.has(node.id);

	const kelasLabel = cn(
		'flex-1 rounded-md px-1.5 py-1.5 text-left text-sm leading-snug transition-colors',
		depth === 0 ? 'font-medium' : 'font-normal',
		isAktif
			? 'bg-sidebar-accent font-semibold text-sidebar-primary'
			: diJalurAktif
				? 'text-sidebar-primary'
				: 'text-foreground/80',
	);

	return (
		<div>
			<div className="flex items-start">
				{punyaAnak ? (
					<button
						type="button"
						onClick={() => onToggle(node.id)}
						aria-expanded={terbuka}
						aria-label={`${terbuka ? 'Tutup' : 'Buka'} ${node.label}`}
						className="mt-1.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
					>
						<CaretRightIcon
							className={cn(
								'size-3 transition-transform duration-150',
								terbuka && 'rotate-90',
							)}
						/>
					</button>
				) : (
					// Penyeimbang selebar caret supaya label simpul tanpa anak tetap
					// sejajar dengan saudara-saudaranya yang punya anak.
					<span className="size-5 shrink-0" aria-hidden />
				)}

				{chapter ? (
					<Link
						to={`/editor/${projectId}/${chapter.id}`}
						aria-current={isAktif ? 'page' : undefined}
						className={cn(kelasLabel, 'hover:bg-sidebar-accent')}
					>
						{node.label}
					</Link>
				) : punyaAnak ? (
					// Tanpa bab tujuan, satu-satunya hal berguna yang bisa dilakukan
					// label ini adalah membuka cabangnya.
					<button
						type="button"
						onClick={() => onToggle(node.id)}
						aria-expanded={terbuka}
						className={cn(
							kelasLabel,
							'cursor-pointer hover:bg-sidebar-accent hover:text-foreground',
						)}
					>
						{node.label}
					</button>
				) : (
					<p className={cn(kelasLabel, 'text-muted-foreground')}>{node.label}</p>
				)}
			</div>

			{terbuka && (
				<div className="ml-3 border-l border-border pl-1.5">
					{node.children.map((anak) => (
						<TocNode
							key={anak.id}
							node={anak}
							depth={depth + 1}
							projectId={projectId}
							chapters={chapters}
							chapterAktifId={chapterAktifId}
							jalurAktif={jalurAktif}
							terbentang={terbentang}
							onToggle={onToggle}
						/>
					))}
				</div>
			)}
		</div>
	);
}
