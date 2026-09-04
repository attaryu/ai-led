import { type BuktiDukungRef } from '../../domain/entities/bukti-dukung-ref.entity';

/** Href sentinel dikenali `handleClickOn` di chapter-editor.tsx buat pindah ke tab Bukti. */
export const CITATION_LINK_HREF = '#bukti-dukung';

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bikin "(sumber: X)" jadi link kalau X namaDokumen di buktiDukung bab ini -- sisanya (LED/LKPS) dibiarkan teks biasa. */
export function sisipkanTautanSitasi(html: string, buktiDukung: BuktiDukungRef[]): string {
	let hasil = html;
	for (const ref of buktiDukung) {
		const pola = new RegExp(`\\(sumber: ${escapeRegExp(ref.namaDokumen)}\\)`, 'g');
		hasil = hasil.replace(pola, `(sumber: <a href="${CITATION_LINK_HREF}">${ref.namaDokumen}</a>)`);
	}
	return hasil;
}
