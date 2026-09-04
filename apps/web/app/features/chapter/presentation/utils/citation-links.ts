import { type BuktiDukungRef } from '../../domain/entities/bukti-dukung-ref.entity';

/** Href sentinel dikenali `handleClickOn` di chapter-editor.tsx buat pindah ke tab Bukti. */
export const CITATION_LINK_HREF = '#bukti-dukung';

/** Atribut dikenali `chapter-citation-hover-card.tsx` buat mencocokkan chunk asli. */
export const CITATION_LABEL_ATTR = 'data-citation-label';

const POLA_SITASI = /\(sumber: ([^()]+)\)/g;

function escapeAtribut(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Bungkus SETIAP "(sumber: X)" jadi elemen berlabel `data-citation-label` —
 * dasar buat citation hover-card (`chapter-citation-hover-card.tsx`) yang
 * mencocokkannya ke chunk asli lewat `useSectionSources`.
 *
 * Cuma X yang cocok dengan `namaDokumen` di `buktiDukung` bab ini yang jadi
 * `<a href="#bukti-dukung">` (bisa diklik pindah tab Bukti, perilaku lama) --
 * sisanya (LED/LKPS, atau Evidence yang sudah dihapus dari daftar) jadi
 * `<span>` biasa: hover-card tetap jalan untuk keduanya, cuma yang Evidence
 * dikonfirmasi yang punya tab tujuan buat diklik.
 */
export function sisipkanTautanSitasi(html: string, buktiDukung: BuktiDukungRef[]): string {
	const namaBerkas = new Set(buktiDukung.map((ref) => ref.namaDokumen));

	return html.replace(POLA_SITASI, (cocok, label: string) => {
		const bisaLompat = namaBerkas.has(label);
		const tag = bisaLompat ? 'a' : 'span';
		const atributLompat = bisaLompat ? ` href="${CITATION_LINK_HREF}"` : '';
		return `(sumber: <${tag}${atributLompat} ${CITATION_LABEL_ATTR}="${escapeAtribut(label)}">${label}</${tag}>)`;
	});
}
