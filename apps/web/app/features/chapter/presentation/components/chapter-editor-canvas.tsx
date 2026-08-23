import { LockIcon, EyeIcon, ClockIcon, type Icon } from '@phosphor-icons/react';
import { EditorContent, type Editor } from '@tiptap/react';

import {
	frasaBlokir,
	type AlasanBlokir,
	type ChapterPermission,
} from '../hooks/use-chapter-permission';

/**
 * Ikon dan kalimat lanjutan tiap alasan; frasa pembukanya dari `frasaBlokir`
 * supaya spanduk ini dan kaki tab Draft/Generasi menyebut sebab yang sama
 * persis. `Record` menjadikan alasan baru compile error, bukan kalimat keliru.
 */
const spandukBlokir: Record<AlasanBlokir, { icon: Icon; lanjutan: string }> = {
	// §12.2: kunci memblokir aksi ubah, bukan membaca — semua tab di kanan tetap
	// bisa dibuka.
	terkunci: {
		icon: LockIcon,
		lanjutan: 'Isinya masih bisa dibaca, tapi tidak bisa diubah.',
	},
	diajukan: {
		icon: ClockIcon,
		lanjutan:
			'Batalkan pengajuan di tab Review kalau isinya masih mau diubah.',
	},
	'hanya-baca': {
		icon: EyeIcon,
		lanjutan:
			'Perubahan konten hanya bisa dilakukan Penyusun dan Penjamin Mutu.',
	},
};

/**
 * Kanvas "kertas" Editor Bab (docs/application_flow.md §7.2).
 *
 * Satu `BAB_DOKUMEN` = satu ruang kerja utuh: secara visual halamannya bisa
 * memanjang jadi banyak bagian, tapi semuanya tetap satu `kontenKerja` milik bab
 * ini dan tidak dipecah jadi entitas terpisah per bagian.
 */
export function ChapterEditorCanvas({
	editor,
	judulBab,
	blockedReason,
}: {
	editor: Editor;
	judulBab: string;
	blockedReason: ChapterPermission['blockedReason'];
}) {
	return (
		// Gulungan sengaja tetap native, bukan `ScrollArea` seperti dua sidebar:
		// ProseMirror mengurus sendiri pengejaran kursor lewat `scrollIntoView` yang
		// menelusuri ancestor pertama yang bisa digulung, dan menyisipkan lapis
		// pembungkus di jalur itu menambah titik gagal untuk imbalan yang tidak ada —
		// kolomnya lebar, jadi tebal scrollbar tidak memakan ruang yang berarti.
		// Yang disamakan hanya rupanya, lewat `data-slot` ini di app.css.
		<main
			data-slot="chapter-editor-canvas"
			className="min-w-0 flex-1 overflow-y-auto bg-muted/40 p-8"
		>
			<div className="mx-auto max-w-3xl space-y-3">
				{blockedReason && <SpandukBlokir alasan={blockedReason} />}

				<div className="rounded-md bg-card px-12 py-14 shadow-sm">
					<h2 className="mb-6 font-heading text-xl font-bold tracking-tight">
						{judulBab}
					</h2>
					<EditorContent editor={editor} />
				</div>
			</div>
		</main>
	);
}

function SpandukBlokir({ alasan }: { alasan: AlasanBlokir }) {
	const { icon: Ikon, lanjutan } = spandukBlokir[alasan];

	return (
		<div className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
			<Ikon className="size-4 shrink-0" />
			<span>
				{frasaBlokir[alasan]}. {lanjutan}
			</span>
		</div>
	);
}
