import { type Editor } from '@tiptap/react';

import { kodeTabelSetor, type PmNode } from '../../domain/entities/indicator-assessment.entity';

type TabelAda = { kode: string; from: number; to: number };

/** Tabel hasil Setor ke LED yang sudah ada di dokumen, dikenali dari header lima kolomnya + kode di baris data. */
export function cariTabelSetor(editor: Editor): TabelAda[] {
	const ada: TabelAda[] = [];
	editor.state.doc.descendants((node, pos) => {
		if (node.type.name !== 'table') return true;
		const kode = kodeTabelSetor(node.toJSON() as PmNode);
		if (kode) ada.push({ kode, from: pos, to: pos + node.nodeSize });
		return false;
	});
	return ada;
}

/** Kode dari `tabel` yang sudah punya tabel di dokumen — dasar konfirmasi sebelum mengganti. */
export function kodeYangSudahAda(editor: Editor, tabel: PmNode[]): string[] {
	const ada = new Set(cariTabelSetor(editor).map((t) => t.kode));
	return tabel.map((t) => kodeTabelSetor(t)).filter((k): k is string => k !== null && ada.has(k));
}

/**
 * Menyisipkan tabel hasil sebagai node ProseMirror (dibangun lewat skema editor
 * aktif, jadi struktur tak valid ditolak di sini, bukan dibuang diam-diam).
 * Isi lain tidak disentuh: tabel baru diletakkan tepat setelah blok tempat
 * kursor berada, masing-masing dipisah paragraf kosong. Tabel untuk indikator
 * yang sama ditimpa HANYA bila `gantiKode` memuat kodenya; selain itu tabel
 * lama dibiarkan dan tabel barunya dilewati. Satu transaksi → satu langkah undo.
 */
export function sisipkanTabelSetor(editor: Editor, tabel: PmNode[], gantiKode: ReadonlySet<string>): { disisipkan: number; diganti: number } {
	const { state } = editor;
	const ada = new Map(cariTabelSetor(editor).map((t) => [t.kode, t]));
	const tr = state.tr;
	const baru: PmNode[] = [];
	const ganti: { t: TabelAda; node: PmNode }[] = [];

	for (const node of tabel) {
		const kode = kodeTabelSetor(node);
		const lama = kode ? ada.get(kode) : undefined;
		if (!lama) baru.push(node);
		else if (kode && gantiKode.has(kode)) ganti.push({ t: lama, node });
	}

	const posSisip = state.selection.$to.depth >= 1 ? state.selection.$to.after(1) : state.doc.content.size;
	for (const { t, node } of ganti.sort((a, b) => b.t.from - a.t.from)) {
		tr.replaceWith(t.from, t.to, state.schema.nodeFromJSON(node));
	}
	if (baru.length > 0) {
		const potongan = baru.flatMap((n) => [state.schema.nodeFromJSON(n), state.schema.nodeFromJSON({ type: 'paragraph' })]);
		tr.insert(tr.mapping.map(posSisip), potongan);
	}
	if (ganti.length + baru.length > 0) editor.view.dispatch(tr.scrollIntoView());
	return { disisipkan: baru.length, diganti: ganti.length };
}
