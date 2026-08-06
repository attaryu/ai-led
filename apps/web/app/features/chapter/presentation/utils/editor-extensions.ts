import { Placeholder } from '@tiptap/extensions';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import { StarterKit } from '@tiptap/starter-kit';

/**
 * Ekstensi kanvas Editor Bab, satu daftar untuk seluruh aplikasi.
 *
 * `StarterKit` v3 **sudah** membawa Bold, Italic, Underline, kedua jenis daftar
 * beserta keymap-nya, heading, blockquote, dan UndoRedo — jadi paket-paket itu
 * tidak boleh dipasang terpisah, karena ekstensi ganda memicu peringatan dan
 * perilaku yang tidak terduga. Yang benar-benar perlu ditambah hanya tiga:
 *
 * - `TextAlign` — empat tombol perataan di toolbar.
 * - `TextStyle` + `FontSize` — stepper ukuran font. `FontSize` menulis atribut
 *   inline ke mark `textStyle`, jadi `TextStyle` wajib ikut terdaftar.
 * - `Placeholder` — petunjuk di bab yang masih kosong; gayanya di app.css.
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
	TextAlign.configure({ types: ['heading', 'paragraph'] }),
	TextStyle,
	FontSize,
	Placeholder.configure({
		placeholder: 'Mulai menulis bab ini…',
	}),
];
