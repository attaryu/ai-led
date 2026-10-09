import { Placeholder } from '@tiptap/extensions';
import { TableKit } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import { StarterKit } from '@tiptap/starter-kit';
import { CitationLabel } from './citation-mark';

/**
 * Ekstensi kanvas Editor Bab, satu daftar untuk seluruh aplikasi.
 *
 * `StarterKit` v3 **sudah** membawa Bold, Italic, Underline, kedua jenis daftar
 * beserta keymap-nya, heading, blockquote, dan UndoRedo — jadi paket-paket itu
 * tidak boleh dipasang terpisah, karena ekstensi ganda memicu peringatan dan
 * perilaku yang tidak terduga. Yang benar-benar perlu ditambah:
 *
 * - `TextAlign` — empat tombol perataan di toolbar.
 * - `TextStyle` + `FontSize` — stepper ukuran font. `FontSize` menulis atribut
 *   inline ke mark `textStyle`, jadi `TextStyle` wajib ikut terdaftar.
 * - `Placeholder` — petunjuk di bab yang masih kosong; gayanya di app.css.
 * - `CitationLabel` (`citation-mark.ts`) — mempertahankan `data-citation-label`
 *   sitasi "(sumber: X)" lewat parse/render TipTap; tanpa ini atributnya
 *   dibuang begitu konten diparsing, dan hover-card/klik-buka-berkas sitasi
 *   tidak pernah benar-benar jalan di DOM sungguhan.
 * - `TableKit` — satu paket berisi tabel, baris, sel, dan sel header sekaligus.
 *   Alasannya sama persis dengan `CitationLabel`, dan akibatnya sama senyapnya:
 *   TipTap membuang apa pun yang tidak punya padanan di schema-nya saat
 *   mem-parse HTML, jadi tanpa ini `<table>` hasil generate rata jadi paragraf
 *   dan instruksi tabel per sub-bab tidak pernah menghasilkan satu tabel pun
 *   yang terlihat. Gayanya di app.css.
 *
 * `StarterKit` juga membawa `Link`. Tidak ada tombol tautan di rancangan, tapi
 * ia dibiarkan hidup karena memberi autolink saat menempel URL secara gratis,
 * dan `unsetAllMarks()` milik tombol "bersihkan format" tetap membersihkannya.
 */
export const editorExtensions = [
	StarterKit.configure({
		// Perataan dipasang ke paragraf dan heading saja (lihat TextAlign di
		// bawah), jadi tidak ada konfigurasi khusus yang dibutuhkan di sini.
	}),
	TableKit,
	// ponytail: dulu tanpa `defaultAlignment` (bawaan Tiptap 'left'). Kini rata kanan-kiri
	// ('justify') untuk semua teks yang belum diberi perataan eksplisit -- termasuk dokumen
	// baru. Perataan bawaan tidak ditulis ke HTML, jadi yang disimpan tetap ringkas; pilihan
	// lain di toolbar (kiri/tengah/kanan) ditulis eksplisit dan tetap dihormati.
	// TextAlign.configure({ types: ['heading', 'paragraph'] }),
	TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'justify' }),
	TextStyle,
	FontSize,
	Placeholder.configure({
		placeholder: 'Mulai menulis bab ini…',
	}),
	CitationLabel,
];
