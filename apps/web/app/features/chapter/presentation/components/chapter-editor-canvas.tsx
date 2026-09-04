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
	// Kalimat lanjutan hanya diisi kalau ia menambah sesuatu yang belum
	// tersirat. "Dikunci" sudah berarti "tidak bisa diubah", jadi mengejanya
	// lagi cuma memanjangkan spanduk tanpa memberi tahu apa pun; yang berguna
	// justru jalan keluarnya, dan itu hanya ada pada `diajukan`.
	terkunci: {
		icon: LockIcon,
		lanjutan: '',
	},
	diajukan: {
		icon: ClockIcon,
		lanjutan: 'Batalkan pengajuannya di tab Review kalau masih mau diubah.',
	},
	'hanya-baca': {
		icon: EyeIcon,
		lanjutan: 'Yang bisa mengubah isinya Penyusun dan Penjamin Mutu.',
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
			className="min-w-0 flex-1 overflow-y-auto bg-muted/40 p-4 sm:p-8"
		>
			<div className="mx-auto max-w-3xl space-y-3">
				{blockedReason && <SpandukBlokir alasan={blockedReason} />}

				{/*
				 * Margin "kertas" menyusut jauh di layar sempit. Di 360 px `p-8`
				 * kanvas plus `px-12` kertas memakan 160 px dari 360, menyisakan
				 * kolom teks 200 px — terlalu sempit untuk membaca, apalagi
				 * meninjau. Menulis di lebar ini memang tetap urusan laptop, tapi
				 * membaca tidak boleh ikut mustahil.
				 */}
				<div className="rounded-md bg-card px-5 py-8 shadow-sm sm:px-12 sm:py-14">
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
			{/* `lanjutan` boleh kosong; tanpa penjaga ini spanduknya berakhir
			    dengan titik lalu satu spasi menggantung. */}
			<span>
				{frasaBlokir[alasan]}.{lanjutan && ` ${lanjutan}`}
			</span>
		</div>
	);
}
