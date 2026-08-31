import { z } from 'zod';

import {
	rubricCriterionSchema,
	rubricLevelSchema,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';

/**
 * Satu kriteria seperti yang diisi lewat formulir, bukan seperti yang disimpan.
 *
 * Tiga bedanya dari `rubricCriterionSchema`, semuanya karena formulir HTML:
 *
 * - `id` tidak diminta — ia dibuat repository, dan meminta pengguna
 *   memikirkannya hanya membuka peluang tabrakan.
 * - `tabelLkps` diterima sebagai satu baris teks dipisah koma. Larik tidak punya
 *   padanan langsung di `<input>`, dan tiga kolom terpisah untuk sesuatu yang
 *   sering kosong lebih merepotkan daripada memisah koma sendiri.
 * - Aturan tambahan yang tidak ada di entity, karena entity juga memuat data
 *   seed yang tidak lewat formulir ini.
 */
export const rubricCriterionFormSchema = rubricCriterionSchema
	.omit({ id: true, tabelLkps: true, levelSkor: true, urutanBab: true })
	.extend({
		kodeKriteria: z
			.string()
			.min(1, 'Kode kriteria wajib diisi')
			.max(20, 'Kode kriteria maksimal 20 karakter'),
		kriteria: z
			.string()
			.min(1, 'Kelompok kriteria wajib diisi')
			.max(120, 'Kelompok kriteria maksimal 120 karakter'),
		deskripsi: z.string().min(1, 'Bunyi kriteria wajib diisi'),
		/** Dipisah koma, misal `Tabel 3.a.1, Tabel 3.a.2`. Boleh kosong. */
		tabelLkps: z.string(),
		/**
		 * Minimal satu bab. Kriteria yang tidak menilai bab mana pun tidak akan
		 * pernah muncul di layar mana pun — tersimpan, tapi tidak berlaku.
		 */
		urutanBab: z
			.array(z.number().int().positive())
			.min(1, 'Pilih minimal satu bab yang dinilai kriteria ini'),
		/**
		 * Minimal dua level. Satu level bukan skala penilaian, melainkan satu
		 * pernyataan — tidak ada yang bisa dibedakan darinya.
		 */
		levelSkor: z
			.array(
				rubricLevelSchema.extend({
					skor: z
						.number({ message: 'Skor wajib diisi' })
						.int('Skor harus bilangan bulat')
						.min(0, 'Skor minimal 0')
						.max(100, 'Skor maksimal 100'),
					deskripsi: z.string().min(1, 'Bunyi level wajib diisi'),
				}),
			)
			.min(2, 'Rubrik butuh minimal dua level skor supaya ada yang dibedakan'),
	})
	.superRefine((nilai, ctx) => {
		// Skor kembar membuat `levelUntukSkor` memilih salah satu diam-diam, dan
		// pembaca hasil penilaian tidak punya cara tahu yang mana.
		const terlihat = new Set<number>();

		nilai.levelSkor.forEach((level, index) => {
			if (terlihat.has(level.skor)) {
				ctx.addIssue({
					code: 'custom',
					path: ['levelSkor', index, 'skor'],
					message: `Skor ${level.skor} sudah dipakai level lain`,
				});
			}
			terlihat.add(level.skor);
		});
	});

export type RubricCriterionFormDto = z.input<typeof rubricCriterionFormSchema>;

/** `Tabel 3.a, Tabel 3.b` → `['Tabel 3.a', 'Tabel 3.b']`; kosong → `[]`. */
export function parseTabelLkps(teks: string): string[] {
	return teks
		.split(',')
		.map((bagian) => bagian.trim())
		.filter(Boolean);
}
