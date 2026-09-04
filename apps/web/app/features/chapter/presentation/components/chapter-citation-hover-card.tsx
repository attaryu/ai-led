import * as React from 'react';
import { Popover } from '@base-ui/react/popover';
import {
	BookOpenIcon,
	CaretLeftIcon,
	CaretRightIcon,
	FileTextIcon,
} from '@phosphor-icons/react';
import { type Editor } from '@tiptap/react';

import { type SectionSumber } from '../../domain/entities/chunk-sumber.entity';
import { CITATION_LABEL_ATTR } from '../utils/citation-links';

const TUNDA_TUTUP_MS = 150;

/**
 * Hover-card sitasi: arahkan kursor (atau ketuk di layar sentuh) ke
 * "(sumber: X)" di narasi, muncul kartu isi chunk X yang SUNGGUHAN dipakai AI
 * (`useSectionSources`) — bukan tab terpisah yang memutus fokus baca.
 *
 * **Trigger-nya hidup di DOM mentah ProseMirror**, bukan elemen React (ia
 * bagian dari `sisipkanTautanSitasi`'s HTML yang di-render TipTap), jadi
 * listener dipasang langsung ke `editor.view.dom` alih-alih `<Popover.Trigger>`
 * — posisi kartu memakai `anchor` Base UI, yang menerima elemen DOM apa pun.
 *
 * Tidak aktif (`sumber === undefined`) di mode kanvas gabungan seluruh bab
 * (bukan satu section) — lihat JSDoc `useSectionSources`.
 */
export function ChapterCitationHoverCard({
	editor,
	sumber,
}: {
	editor: Editor | null;
	sumber: SectionSumber | undefined;
}) {
	const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
	const [label, setLabel] = React.useState<string | null>(null);
	const [halaman, setHalaman] = React.useState(0);
	const tutupTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	const batalkanTutup = React.useCallback(() => {
		if (tutupTimer.current) {
			clearTimeout(tutupTimer.current);
			tutupTimer.current = null;
		}
	}, []);

	const jadwalkanTutup = React.useCallback(() => {
		batalkanTutup();
		tutupTimer.current = setTimeout(() => {
			setAnchor(null);
			setLabel(null);
		}, TUNDA_TUTUP_MS);
	}, [batalkanTutup]);

	React.useEffect(() => {
		if (!editor || !sumber) return;
		const dom = editor.view.dom;

		function onOver(event: MouseEvent) {
			const target = (event.target as HTMLElement).closest<HTMLElement>(
				`[${CITATION_LABEL_ATTR}]`,
			);
			if (!target) return;
			batalkanTutup();
			setAnchor(target);
			setLabel(target.getAttribute(CITATION_LABEL_ATTR));
		}
		function onOut(event: MouseEvent) {
			if ((event.target as HTMLElement).closest(`[${CITATION_LABEL_ATTR}]`)) jadwalkanTutup();
		}

		dom.addEventListener('mouseover', onOver);
		dom.addEventListener('mouseout', onOut);
		return () => {
			dom.removeEventListener('mouseover', onOver);
			dom.removeEventListener('mouseout', onOut);
		};
	}, [editor, sumber, batalkanTutup, jadwalkanTutup]);

	// Halaman-nya reset tiap ganti sitasi -- kartu selalu buka dari sumber
	// pertama, bukan mempertahankan indeks sitasi sebelumnya yang tidak nyambung.
	React.useEffect(() => {
		setHalaman(0);
	}, [label]);

	const cocok = label ? (sumber?.chunks ?? []).filter((chunk) => chunk.label === label) : [];

	if (!anchor || cocok.length === 0) return null;

	const aktif = cocok[Math.min(halaman, cocok.length - 1)];
	const Ikon = aktif.jenis === 'led' ? BookOpenIcon : FileTextIcon;

	return (
		<Popover.Root
			open
			onOpenChange={(open) => {
				if (!open) {
					setAnchor(null);
					setLabel(null);
				}
			}}
		>
			<Popover.Portal>
				<Popover.Positioner anchor={anchor} side="top" align="start" sideOffset={6} className="z-50">
					<Popover.Popup
						onMouseEnter={batalkanTutup}
						onMouseLeave={jadwalkanTutup}
						className="w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md"
					>
						{cocok.length > 1 && (
							<div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
								<button
									type="button"
									onClick={() => setHalaman((h) => Math.max(0, h - 1))}
									disabled={halaman === 0}
									className="cursor-pointer rounded p-0.5 hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
									aria-label="Sumber sebelumnya"
								>
									<CaretLeftIcon className="size-3.5" />
								</button>
								<span>
									{halaman + 1}/{cocok.length}
								</span>
								<button
									type="button"
									onClick={() => setHalaman((h) => Math.min(cocok.length - 1, h + 1))}
									disabled={halaman === cocok.length - 1}
									className="cursor-pointer rounded p-0.5 hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
									aria-label="Sumber berikutnya"
								>
									<CaretRightIcon className="size-3.5" />
								</button>
								<span>{cocok.length} sumber</span>
							</div>
						)}

						<div className="flex items-center gap-1.5">
							<Ikon className="size-4 shrink-0 text-muted-foreground" />
							<span className="truncate text-sm font-medium">{aktif.label}</span>
						</div>
						<p className="mt-1.5 line-clamp-6 text-xs leading-relaxed text-muted-foreground">
							{aktif.teks}
						</p>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
