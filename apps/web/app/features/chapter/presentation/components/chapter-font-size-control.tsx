import { MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { type Editor } from '@tiptap/react';
import * as React from 'react';

import { Button } from '~/core/components/ui/button';

/**
 * Ukuran dasar kanvas. Harus sama dengan `font-size` `.tiptap` di app.css —
 * angka di kotak ini baru jujur kalau keduanya sepakat.
 */
export const UKURAN_FONT_DEFAULT = 14;
const UKURAN_MIN = 8;
const UKURAN_MAX = 96;

/**
 * Stepper ukuran font `[− 14 +]` di toolbar Editor Bab.
 *
 * Memakai perintah `setFontSize` dari `@tiptap/extension-text-style`, yang
 * menulis `style="font-size: …"` ke mark `textStyle`. Ukuran diambil dari
 * seleksi yang sedang aktif; teks yang belum pernah diatur tidak punya atribut
 * itu sama sekali, jadi jatuh ke {@link UKURAN_FONT_DEFAULT}.
 */
export function ChapterFontSizeControl({
	editor,
	ukuran,
	disabled = false,
}: {
	editor: Editor;
	ukuran: number;
	disabled?: boolean;
}) {
	// Teks yang sedang diketik dipegang lokal supaya angka setengah jadi (mis.
	// "1" dalam perjalanan menuju "18") tidak langsung diterapkan ke dokumen.
	const [draft, setDraft] = React.useState<string | null>(null);

	const terapkan = React.useCallback(
		(nilai: number) => {
			const aman = Math.min(UKURAN_MAX, Math.max(UKURAN_MIN, Math.round(nilai)));
			editor.chain().focus().setFontSize(`${aman}px`).run();
		},
		[editor],
	);

	const commit = () => {
		const angka = Number.parseInt(draft ?? '', 10);
		// Masukan tidak masuk akal dikembalikan ke nilai dokumen, bukan ditolak
		// dengan pesan galat — ini kontrol pemanis, bukan formulir.
		if (Number.isFinite(angka)) terapkan(angka);
		setDraft(null);
	};

	return (
		<div className="flex items-center gap-0.5 rounded-md border border-border px-0.5">
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				title="Perkecil ukuran huruf"
				aria-label="Perkecil ukuran huruf"
				disabled={disabled || ukuran <= UKURAN_MIN}
				onClick={() => terapkan(ukuran - 1)}
				className="cursor-pointer"
			>
				<MinusIcon className="size-3.5" />
			</Button>

			<input
				type="text"
				inputMode="numeric"
				// `type="number"` sengaja dihindari: pemutar bawaannya akan bersaing
				// dengan tombol − dan + di kiri-kanannya.
				aria-label="Ukuran huruf"
				disabled={disabled}
				value={draft ?? String(ukuran)}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						commit();
					}
					if (event.key === 'Escape') setDraft(null);
				}}
				className="h-7 w-9 rounded-sm bg-muted text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
			/>

			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				title="Perbesar ukuran huruf"
				aria-label="Perbesar ukuran huruf"
				disabled={disabled || ukuran >= UKURAN_MAX}
				onClick={() => terapkan(ukuran + 1)}
				className="cursor-pointer"
			>
				<PlusIcon className="size-3.5" />
			</Button>
		</div>
	);
}
