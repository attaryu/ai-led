import { z } from 'zod';

import { skorMaksimal, type RubricCriterion } from './rubric-criterion.entity';

/**
 * Hasil satu kriteria pada satu kali simulasi (docs/database.md →
 * `HASIL_SKOR_KRITERIA`).
 *
 * Satu baris per kriteria, per target. Targetnya **salah satu** dari bab aktif
 * atau checkpoint — itulah gunanya `targetTipe`, dan kenapa dua kolom idnya
 * saling meniadakan.
 *
 * Kebijakan penyimpanannya "main timpa", sama seperti `kontenKerja` dan
 * `BUKTI_DUKUNG_BAB`: menjalankan ulang simulasi untuk target yang sama
 * **mengganti** baris lamanya, tidak menumpuk riwayat berlapis.
 */
export const chapterScoreTargetEnum = z.enum(['BAB_AKTIF', 'BAB_DRAFT']);
export type ChapterScoreTarget = z.infer<typeof chapterScoreTargetEnum>;

export const chapterScoreSchema = z.object({
	id: z.string(),
	kriteriaId: z.string(),
	targetTipe: chapterScoreTargetEnum,
	/** Terisi bila `targetTipe = 'BAB_AKTIF'`. */
	babId: z.string().nullable(),
	/** Terisi bila `targetTipe = 'BAB_DRAFT'`. */
	babDraftId: z.string().nullable(),
	skorDidapat: z.number().int().nonnegative(),
	/** Alasan AI memberi skor segitu; kosong bila penilainya tidak menjelaskan. */
	justifikasi: z.string(),
	dijalankanOlehUserId: z.string(),
	/** Nama ikut disimpan dengan alasan yang sama seperti `ChapterDraftEntity.dibuatOlehNama`. */
	dijalankanOlehNama: z.string(),
	dijalankanPada: z.string(),
});

export type ChapterScoreEntity = z.infer<typeof chapterScoreSchema>;

export type RingkasanSkor = {
	/** Jumlah kriteria yang sudah punya hasil. */
	jumlahDinilai: number;
	totalDidapat: number;
	totalMaksimal: number;
	/** 0–100, dibulatkan. 0 bila belum ada yang dinilai. */
	persen: number;
	/** Waktu simulasi terakhir; `null` bila belum pernah dijalankan. */
	dijalankanPada: string | null;
	dijalankanOlehNama: string | null;
};

/**
 * Total skor dihitung **saat dibaca**, bukan disimpan sebagai kolom agregat —
 * docs/database.md §12 menyebutnya eksplisit, "agar skema tetap sederhana".
 *
 * Penyebutnya adalah jumlah skor maksimal dari **kriteria yang sudah dinilai**,
 * bukan dari seluruh kriteria bab. Bedanya terasa saat rubrik bertambah setelah
 * simulasi terakhir dijalankan: memakai seluruh kriteria akan membuat persentase
 * ikut turun sendiri padahal isi babnya tidak berubah — angka yang bergerak tanpa
 * ada yang menggerakkannya.
 */
export function ringkasSkor(
	hasil: ChapterScoreEntity[],
	kriteria: RubricCriterion[],
): RingkasanSkor {
	const perId = new Map(kriteria.map((item) => [item.id, item]));

	let totalDidapat = 0;
	let totalMaksimal = 0;
	let jumlahDinilai = 0;
	let dijalankanPada: string | null = null;
	let dijalankanOlehNama: string | null = null;

	for (const baris of hasil) {
		const acuan = perId.get(baris.kriteriaId);
		// Hasil yang kriterianya sudah tidak berlaku untuk bab ini tidak ikut
		// dihitung: ia sisa rubrik lama, dan memasukkannya membuat totalnya
		// menjelaskan sesuatu yang tidak lagi ditampilkan.
		if (!acuan) continue;

		jumlahDinilai += 1;
		totalDidapat += baris.skorDidapat;
		totalMaksimal += skorMaksimal(acuan);

		if (dijalankanPada === null || baris.dijalankanPada > dijalankanPada) {
			dijalankanPada = baris.dijalankanPada;
			dijalankanOlehNama = baris.dijalankanOlehNama;
		}
	}

	return {
		jumlahDinilai,
		totalDidapat,
		totalMaksimal,
		persen:
			totalMaksimal === 0
				? 0
				: Math.round((totalDidapat / totalMaksimal) * 100),
		dijalankanPada,
		dijalankanOlehNama,
	};
}
