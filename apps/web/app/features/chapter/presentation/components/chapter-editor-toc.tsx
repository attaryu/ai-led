import { CaretRightIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import * as React from 'react';
import { Link } from 'react-router';

import { Button } from '~/core/components/ui/button';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { cn } from '~/core/lib/utils';
import { chapterRepository } from '../../data/repositories/chapter.repository';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import {
	findChapterForTocNode,
	findTocPathForChapter,
	type ChapterTocNode,
} from '../../domain/entities/chapter-toc.entity';
import { FormSection } from './chapter-section-list';

/**
 * Sidebar kiri Editor Bab — Daftar Isi (docs/application_flow.md §7.1).
 *
 * Pohonnya dibangun per Set Akreditasi dokumen ini (`chapterToc`, dari
 * `chapter-toc.entity.ts::buildChapterToc`). Dua hal yang berbeda
 *
 * - **Caret** membentangkan/menutup cabangnya, tanpa berpindah bab.
 * - **Label** berpindah bab, tapi hanya untuk simpul yang punya `urutanBab`.
 *
 * Simpul struktural (tanpa bab) tidak punya tujuan, jadi labelnya ikut jadi
 * pemicu buka-tutup — kalau tidak, satu-satunya sasaran kliknya cuma ikon 12 px.
 *
 * Simpul ber-`sectionId` (`ChapterSection` yang outline-nya sudah pernah
 * di-generate) BISA diklik — kliknya SWITCH ke tampilan section itu saja,
 * bukan menggulung. Simpul dekoratif (kelompok kriteria, atau sub-bab
 * referensi `ChapterTemplate` sebelum outline pernah dibuat) belum punya
 * konten sungguhan buat dituju, jadi labelnya cuma pemicu buka-tutup.
 *
 * Status terbentang dipegang halaman editor, bukan komponen ini — alasannya di
 * `chapter-editor.tsx`.
 *
 * Tombol `[+]` per baris (hover) — tambah sub-bab/sub-sub-bab manual langsung dari sini.
 */
export function ChapterEditorToc({
	projectId,
	chapters,
	chapterToc,
	chapterAktif,
	sectionIdAktif,
	terbentang,
	onToggle,
	terbuka,
	onTutup,
	onSectionAdded,
}: {
	projectId: string;
	chapters: ChapterEntity[];
	/** Dibangun per Set Akreditasi dokumen ini -- lihat `chapter-toc.entity.ts::buildChapterToc`. Kosong selama masih dimuat. */
	chapterToc: ChapterTocNode[];
	chapterAktif: ChapterEntity;
	/** Non-null → kanvas sedang menampilkan section ini, bukan bab utuh. */
	sectionIdAktif: string | null;
	terbentang: ReadonlySet<string>;
	onToggle: (id: string) => void;
	/** Hanya berlaku di bawah `lg`; di desktop kolomnya selalu menempel. */
	terbuka: boolean;
	onTutup: () => void;
	/** Dipanggil sesudah tambah section manual lewat `[+]` — pemanggil membangun ulang `chapterToc`. */
	onSectionAdded: () => void | Promise<void>;
}) {
	const jalurAktif = new Set(
		findTocPathForChapter(chapterAktif.urutanBab, chapterToc, sectionIdAktif).map(
			(node) => node.id,
		),
	);

	return (
		// `ScrollArea`, bukan `overflow-y-auto`: kolomnya 288 px, dan scrollbar
		// bawaan Windows selebar ~17 px di situ setara satu tingkat indentasi pohon.
		// Alasan lengkapnya di `chapter-generation-panel.tsx`. Kanvas editor sengaja
		// tetap memakai gulungan native — ProseMirror mengurus penggulungan kursornya
		// sendiri, dan di kolom selebar itu scrollbar tebal tidak merugikan apa pun.
		// `render` dipakai supaya elemennya tetap `<aside>`: ini landmark navigasi
		// dokumen, dan menurunkannya jadi `div` menghilangkan satu titik lompat bagi
		// pengguna pembaca layar demi perkara kosmetik.
		<ScrollArea
			render={<aside id="chapter-editor-toc" />}
			className={cn(
				'w-72 shrink-0 border-r border-border bg-background',
				// Semua gaya laci ditulis `max-lg:`, bukan dibatalkan lagi dengan
				// `lg:`. Di ≥ lg elemen ini lalu benar-benar tidak punya properti
				// `translate` — dan itu bukan perkara rapi-rapian: elemen
				// ber-`translate` jadi containing block bagi keturunan `fixed`,
				// yang akan mengurung laci melayang mana pun di dalamnya.
				// `fixed!` dengan tanda seru, satu-satunya di berkas ini: Base UI
				// menulis `position: relative` sebagai **style inline** di
				// `ScrollArea.Root` untuk menambatkan scrollbar-nya, dan style inline
				// mengalahkan kelas apa pun. Deklarasi `!important` ini hidup di dalam
				// `@media (width < 64rem)`, jadi di ≥ lg ia tidak pernah ikut
				// diperhitungkan sama sekali.
				'max-lg:fixed! max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:shadow-lg',
				// `invisible`, bukan `opacity-0`: `visibility: hidden` mencabut
				// isinya dari tab order sekaligus, dan ia properti CSS sehingga bisa
				// dikendalikan media query — tidak seperti atribut `inert`.
				'max-lg:invisible max-lg:-translate-x-full',
				'max-lg:transition-[translate,visibility] max-lg:transition-discrete max-lg:duration-200 max-lg:ease-out max-lg:motion-reduce:transition-none',
				terbuka && 'max-lg:visible max-lg:translate-x-0',
			)}
		>
			<div className="flex items-center justify-between px-5 py-4">
				<h2 className="font-heading text-sm font-bold tracking-tight">
					Daftar Isi
				</h2>

				{/*
				 * Di ≥ lg tombolnya `display:none`, sehingga `justify-between`
				 * dengan satu anak tersisa = rata kiri, persis seperti sebelumnya.
				 */}
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Tutup Daftar Isi"
					onClick={onTutup}
					className="-mr-1.5 shrink-0 cursor-pointer lg:hidden"
				>
					<XIcon className="size-4" />
				</Button>
			</div>

			<nav className="space-y-0.5 px-2 pb-8">
				{chapterToc.map((node) => {
					// Simpul akar selalu setara satu bab (`urutanBab` non-null) — id-nya
					// jadi dasar tautan seluruh keturunannya, termasuk simpul section
					// yang `urutanBab`-nya sendiri `null`. `terkunci`-nya juga ikut
					// turun ke seluruh keturunan lewat prop yang sama: tombol `[+]`
					// tidak boleh nambah section ke bab yang sedang dikunci review.
					const babNyata = findChapterForTocNode(node, chapters);
					return (
						<TocNode
							key={node.id}
							node={node}
							depth={0}
							projectId={projectId}
							chapterIdBab={babNyata?.id}
							chapterTerkunci={babNyata?.terkunci ?? false}
							chapterAktifId={chapterAktif.id}
							sectionIdAktif={sectionIdAktif}
							jalurAktif={jalurAktif}
							terbentang={terbentang}
							onToggle={onToggle}
							onSectionAdded={onSectionAdded}
						/>
					);
				})}
			</nav>
		</ScrollArea>
	);
}

function TocNode({
	node,
	depth,
	projectId,
	chapterIdBab,
	chapterTerkunci,
	chapterAktifId,
	sectionIdAktif,
	jalurAktif,
	terbentang,
	onToggle,
	onSectionAdded,
}: {
	node: ChapterTocNode;
	depth: number;
	projectId: string;
	/** Id bab (nyata) pemilik simpul ini — sama untuk simpul akar dan seluruh keturunannya. */
	chapterIdBab: string | undefined;
	/** Sama untuk simpul akar dan seluruh keturunannya — gerbang tombol `[+]`. */
	chapterTerkunci: boolean;
	chapterAktifId: string;
	sectionIdAktif: string | null;
	jalurAktif: Set<string>;
	terbentang: ReadonlySet<string>;
	onToggle: (id: string) => void;
	onSectionAdded: () => void | Promise<void>;
}) {
	const isChapterNode = node.urutanBab !== null;
	const isAktif = node.sectionId
		? node.sectionId === sectionIdAktif
		: isChapterNode && chapterIdBab === chapterAktifId && sectionIdAktif === null;
	const diJalurAktif = jalurAktif.has(node.id);
	const punyaAnak = node.children.length > 0;
	const terbuka = punyaAnak && terbentang.has(node.id);

	// [+] di BAB: tambah sub-bab. Di sub-bab ber-sectionId (depth 1): tambah sub-sub-bab.
	const bisaTambah =
		!chapterTerkunci && !!chapterIdBab && (isChapterNode || (depth === 1 && node.sectionId !== null));
	const [sedangTambah, setSedangTambah] = React.useState(false);

	async function simpanTambahan(judul: string, panduan: string) {
		if (!chapterIdBab) return;
		await chapterRepository.createSection(
			chapterIdBab,
			judul,
			panduan,
			isChapterNode ? undefined : (node.sectionId ?? undefined),
		);
		// Bentangkan kalau tadinya belum punya anak, biar anak barunya langsung kelihatan.
		const perluBentangSendiri = !punyaAnak;
		setSedangTambah(false);
		await onSectionAdded();
		if (perluBentangSendiri) onToggle(node.id);
	}

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
			<div className="group flex items-start">
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

				{isChapterNode && chapterIdBab ? (
					<Link
						to={`/editor/${projectId}/${chapterIdBab}`}
						aria-current={isAktif ? 'page' : undefined}
						className={cn(kelasLabel, 'hover:bg-sidebar-accent')}
					>
						{node.label}
					</Link>
				) : node.sectionId && chapterIdBab ? (
					<Link
						to={`/editor/${projectId}/${chapterIdBab}/${node.sectionId}`}
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

				{bisaTambah && (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={`Tambah ${isChapterNode ? 'sub-bab' : 'sub-sub-bab'} di ${node.label}`}
						onClick={() => {
							if (punyaAnak && !terbuka) onToggle(node.id);
							setSedangTambah((v) => !v);
						}}
						// Kelihatan pas hover/fokus, atau selalu kalau formnya lagi terbuka.
						className={cn(
							'mt-1 size-6 shrink-0 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
							sedangTambah && 'opacity-100',
						)}
					>
						<PlusIcon className="size-3.5" />
					</Button>
				)}
			</div>

			{sedangTambah && (
				<div className="ml-3 border-l border-border pl-1.5">
					<FormSection onBatal={() => setSedangTambah(false)} onSimpan={simpanTambahan} />
				</div>
			)}

			{terbuka && (
				<div className="ml-3 border-l border-border pl-1.5">
					{node.children.map((anak) => (
						<TocNode
							key={anak.id}
							node={anak}
							depth={depth + 1}
							projectId={projectId}
							chapterIdBab={chapterIdBab}
							chapterTerkunci={chapterTerkunci}
							chapterAktifId={chapterAktifId}
							sectionIdAktif={sectionIdAktif}
							jalurAktif={jalurAktif}
							terbentang={terbentang}
							onToggle={onToggle}
							onSectionAdded={onSectionAdded}
						/>
					))}
				</div>
			)}
		</div>
	);
}
