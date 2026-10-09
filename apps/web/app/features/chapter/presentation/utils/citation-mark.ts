import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Mark khusus buat sitasi "(sumber: X)" (citation-links.ts::sisipkanTautanSitasi).
 *
 * TANPA ini, `data-citation-label` dibuang begitu TipTap mem-parsing HTML
 * awal jadi dokumen ProseMirror: `<span data-citation-label>` tidak cocok
 * skema apa pun (elemen dibuang, cuma teksnya yang tersisa), dan
 * `<a href="#bukti-dukung" data-citation-label>` cuma ditangkap mark `Link`
 * bawaan StarterKit, yang TIDAK tahu atribut kustom (juga dibuang). Akibatnya
 * citation hover-card & klik-buka-berkas (chapter-editor.tsx,
 * chapter-citation-hover-card.tsx) tidak pernah benar-benar berfungsi di
 * browser sungguhan walau lolos typecheck — inilah sebab "belum bisa
 * diklik" yang dilaporkan user.
 *
 * `priority` tinggi supaya rule parse-nya diperhitungkan, tapi mark TIDAK
 * eksklusif terhadap `Link` — pada `<a href>` yang match, keduanya sama-sama
 * menempel ke teks yang sama (Link tetap membawa `href`-nya sendiri), cuma
 * dirender bersarang saat serialize. `chapter-editor.tsx::handleClickOn`
 * mengecek pembungkus `<a href>` lewat `.closest('a[href]')`, bukan
 * `tagName === 'A'` langsung, karena elemen yang match selector
 * `[data-citation-label]` selalu elemen mark ini sendiri (selalu `<span>`).
 */
export const CitationLabel = Mark.create({
	name: 'citationLabel',
	priority: 1000,

	addAttributes() {
		return {
			citationLabel: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-citation-label'),
				renderHTML: (attributes) =>
					attributes.citationLabel ? { 'data-citation-label': attributes.citationLabel } : {},
			},
		};
	},

	parseHTML() {
		return [{ tag: 'a[data-citation-label]' }, { tag: 'span[data-citation-label]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['span', mergeAttributes(HTMLAttributes), 0];
	},
});
