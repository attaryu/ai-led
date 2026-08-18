import { z } from 'zod';

import { assessmentSessionSchema } from '../entities/assessment-session.entity';

/**
 * Bekal memulai satu sesi penilaian.
 *
 * Turunan entitas lewat `.pick()` sesuai aturan arsitektur — bukan bentuk baru
 * yang kebetulan mirip. Yang tidak diminta pemanggil sengaja tidak ada di sini:
 * `totalIndicators` dibaca repository dari master matriks, `completedIndicators`
 * dan `status` adalah keadaan awal yang tetap, dan ketiga stempel waktunya
 * dibuat saat sesi lahir.
 */
export const startAssessmentSchema = assessmentSessionSchema.pick({
	dokumenId: true,
	sumber: true,
	dijalankanOlehUserId: true,
	dijalankanOlehNama: true,
});

export type StartAssessmentDto = z.infer<typeof startAssessmentSchema>;
