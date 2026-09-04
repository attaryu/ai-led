import {
	ArrowUUpLeftIcon,
	ArrowUUpRightIcon,
	EraserIcon,
	ListBulletsIcon,
	ListNumbersIcon,
	TextAlignCenterIcon,
	TextAlignJustifyIcon,
	TextAlignLeftIcon,
	TextAlignRightIcon,
	TextBIcon,
	TextItalicIcon,
	TextUnderlineIcon,
} from '@phosphor-icons/react';
import { useEditorState, type Editor } from '@tiptap/react';

import { Separator } from '~/core/components/ui/separator';
import {
	ChapterFontSizeControl,
	UKURAN_FONT_DEFAULT,
} from './chapter-font-size-control';
import { ChapterToolbarButton } from './chapter-toolbar-button';

const PERATAAN = [
	{ nilai: 'left', label: 'Rata kiri', icon: TextAlignLeftIcon },
	{ nilai: 'center', label: 'Rata tengah', icon: TextAlignCenterIcon },
	{ nilai: 'right', label: 'Rata kanan', icon: TextAlignRightIcon },
	{ nilai: 'justify', label: 'Rata kanan-kiri', icon: TextAlignJustifyIcon },
] as const;

/**
 * Toolbar pemformatan Editor Bab, urutannya mengikuti rancangan.
 *
 * Seluruh status aktif/nonaktif diambil lewat satu `useEditorState`. Ini
 * keharusan, bukan optimasi: sejak Tiptap 3, `shouldRerenderOnTransaction`
 * bernilai `false` secara bawaan, sehingga toolbar yang membaca
 * `editor.isActive(...)` langsung saat render akan tampil sekali lalu membeku —
 * gejalanya terlihat seperti "tombol Bold rusak".
 */
export function ChapterEditorToolbar({
	editor,
	disabled = false,
}: {
	editor: Editor;
	disabled?: boolean;
}) {
	const state = useEditorState({
		editor,
		selector: ({ editor }) => ({
			canUndo: editor.can().undo(),
			canRedo: editor.can().redo(),
			isBold: editor.isActive('bold'),
			isUnderline: editor.isActive('underline'),
			isItalic: editor.isActive('italic'),
			isBulletList: editor.isActive('bulletList'),
			isOrderedList: editor.isActive('orderedList'),
			perataan:
				PERATAAN.find((opsi) => editor.isActive({ textAlign: opsi.nilai }))
					?.nilai ?? 'left',
			// "14px" → 14; kosong berarti belum pernah diatur, jadi pakai bawaan.
			ukuranFont:
				Number.parseInt(editor.getAttributes('textStyle').fontSize ?? '', 10) ||
				UKURAN_FONT_DEFAULT,
		}),
	});

	return (
		<div className="flex items-center gap-0.5">
			<ChapterToolbarButton
				label="Urungkan"
				icon={ArrowUUpLeftIcon}
				disabled={disabled || !state.canUndo}
				onClick={() => editor.chain().focus().undo().run()}
			/>
			<ChapterToolbarButton
				label="Ulangi"
				icon={ArrowUUpRightIcon}
				disabled={disabled || !state.canRedo}
				onClick={() => editor.chain().focus().redo().run()}
			/>

			<Separator orientation="vertical" className="mx-1.5 h-5" />

			<ChapterFontSizeControl
				editor={editor}
				ukuran={state.ukuranFont}
				disabled={disabled}
			/>

			<Separator orientation="vertical" className="mx-1.5 h-5" />

			<ChapterToolbarButton
				label="Tebal"
				icon={TextBIcon}
				active={state.isBold}
				disabled={disabled}
				onClick={() => editor.chain().focus().toggleBold().run()}
			/>
			<ChapterToolbarButton
				label="Garis bawah"
				icon={TextUnderlineIcon}
				active={state.isUnderline}
				disabled={disabled}
				onClick={() => editor.chain().focus().toggleUnderline().run()}
			/>
			<ChapterToolbarButton
				label="Miring"
				icon={TextItalicIcon}
				active={state.isItalic}
				disabled={disabled}
				onClick={() => editor.chain().focus().toggleItalic().run()}
			/>
			<ChapterToolbarButton
				label="Bersihkan format"
				icon={EraserIcon}
				disabled={disabled}
				// Dua perintah karena keduanya beda sasaran: `unsetAllMarks` untuk
				// format sebaris (tebal, miring, tautan), `clearNodes` untuk bentuk
				// bloknya (heading, kutipan, daftar).
				onClick={() =>
					editor.chain().focus().unsetAllMarks().clearNodes().run()
				}
			/>

			<Separator orientation="vertical" className="mx-1.5 h-5" />

			<ChapterToolbarButton
				label="Daftar berbutir"
				icon={ListBulletsIcon}
				active={state.isBulletList}
				disabled={disabled}
				onClick={() => editor.chain().focus().toggleBulletList().run()}
			/>
			<ChapterToolbarButton
				label="Daftar bernomor"
				icon={ListNumbersIcon}
				active={state.isOrderedList}
				disabled={disabled}
				onClick={() => editor.chain().focus().toggleOrderedList().run()}
			/>

			<Separator orientation="vertical" className="mx-1.5 h-5" />

			{PERATAAN.map((opsi) => (
				<ChapterToolbarButton
					key={opsi.nilai}
					label={opsi.label}
					icon={opsi.icon}
					active={state.perataan === opsi.nilai}
					disabled={disabled}
					onClick={() => editor.chain().focus().setTextAlign(opsi.nilai).run()}
				/>
			))}
		</div>
	);
}
