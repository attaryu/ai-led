import { z } from 'zod';

import { assessmentStatusEnum } from './assessment-session.entity';

/**
 * Ringkasan penilaian AMI **satu Dokumen LED** (`GET /assessment/overview`).
 *
 * Tiap baris memuat dua fakta yang sengaja tidak digabung: hasil mesin
 * (`scored`, `averageScore`, `lowScoreCount`, `failed`) dan peninjauan Penjamin
 * Mutu (`reviewed`, `corrected`). Tidak ada angka tunggal yang merangkum
 * keduanya.
 */
export const assessmentOverviewSessionSchema = z.object({
	id: z.string(),
	status: assessmentStatusEnum,
	totalIndicators: z.number().int().nonnegative(),
	completedIndicators: z.number().int().nonnegative(),
	createdAt: z.string(),
});
export type AssessmentOverviewSession = z.infer<
	typeof assessmentOverviewSessionSchema
>;

export const assessmentOverviewSchema = z.object({
	dokumenId: z.string(),
	studyProgramId: z.string(),
	/** Sesi terbaru dokumen ini; `null` = belum pernah dinilai. */
	sesi: assessmentOverviewSessionSchema.nullable(),
	/** Indikator yang punya skor pada sesi terbaru. */
	dinilai: z.number().int().nonnegative(),
	/** Indikator yang error dan tidak punya skor. */
	gagal: z.number().int().nonnegative(),
	/** Rata-rata skor mesin 0–4; `null` bila belum ada skor. */
	skorRataRata: z.number().nullable(),
	/** Jumlah skor ≤ 2. */
	jumlahSkorRendah: z.number().int().nonnegative(),
	/** Jumlah keputusan Penjamin Mutu atas dokumen ini. */
	ditinjau: z.number().int().nonnegative(),
	/** Keputusan yang skor finalnya berbeda dari skor mesin. */
	dikoreksi: z.number().int().nonnegative(),
});
export type AssessmentOverviewEntity = z.infer<typeof assessmentOverviewSchema>;
