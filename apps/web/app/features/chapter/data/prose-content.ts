import type { JSONContent } from '@tiptap/core';
import { generateHTML, generateJSON } from '@tiptap/html';

import { editorExtensions } from '../presentation/utils/editor-extensions';

/** Konten section/bab disimpan sebagai dokumen ProseMirror (sama seperti dimas); domain web tetap memegang HTML karena kanvas memuat HTML. */
const DOC_KOSONG: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function adaTeks(node: JSONContent): boolean {
	if (node.type === 'text') return Boolean(node.text?.trim());
	return (node.content ?? []).some(adaTeks);
}

export function isProseDoc(konten: unknown): konten is JSONContent {
	return typeof konten === 'object' && konten !== null && (konten as { type?: unknown }).type === 'doc';
}

/** Doc tanpa satu pun teks -> `''`, sama dengan penjagaan `HTML_KOSONG` di `hasKonten`. */
export function docToHtml(doc: JSONContent): string {
	return adaTeks(doc) ? generateHTML(doc, editorExtensions) : '';
}

export function htmlToDoc(html: string): JSONContent {
	return html.trim() ? generateJSON(html, editorExtensions) : DOC_KOSONG;
}
