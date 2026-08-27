import { z } from 'zod';

/**
 * Rekomendasi dokumen AI (alur "Rekomendasikan Dokumen -> Konfirmasi",
 * port origin/led-wiriting(dimas)) — 1:1 dengan satu checkpoint kosong
 * (`ChapterDraftEntity`) yang dibuat saat rekomendasi pertama kali dijalankan.
 *
 * **Hanya field yang benar-benar dirender** yang dimodelkan di sini —
 * `documentQuery`/`candidateFolders`/`pedomanUsed`/`rubricUsed`/`lkpsUsed` di
 * baris backend (`writing_document_recommendations`) adalah jejak proses
 * internal AI, tidak pernah ditampilkan ke pengguna. Menyalinnya ke sini
 * hanya menambah medan yang harus dijaga selaras tanpa pembaca.
 */
export const recommendationStatusEnum = z.enum([
	'DIREKOMENDASIKAN',
	'DIKONFIRMASI',
	'DIGANTIKAN',
]);
export type RecommendationStatus = z.infer<typeof recommendationStatusEnum>;

export const recommendationItemSchema = z.object({
	id: z.string(),
	/** Nama dokumen/folder yang disarankan. */
	label: z.string(),
	/** Kenapa item ini disarankan; `null` bila AI tidak menjelaskan. */
	reason: z.string().nullable(),
	order: z.number().int(),
});
export type RecommendationItemEntity = z.infer<typeof recommendationItemSchema>;

export const documentRecommendationSchema = z.object({
	id: z.string(),
	/** Checkpoint kosong yang jadi wadah rekomendasi ini — dikirim balik sebagai `draftId` saat generate. */
	chapterDraftId: z.string(),
	/** Ringkasan naratif dari AI; `null` bila fallback (lihat `worker.py::_FALLBACK_RECOMMENDATION_TEXT`). */
	recommendationText: z.string().nullable(),
	/** Bukti dukung yang dipilih penyusun saat konfirmasi; kosong sebelum dikonfirmasi. */
	selectedEvidenceIds: z.array(z.string()),
	status: recommendationStatusEnum,
	items: z.array(recommendationItemSchema),
});
export type DocumentRecommendationEntity = z.infer<
	typeof documentRecommendationSchema
>;
