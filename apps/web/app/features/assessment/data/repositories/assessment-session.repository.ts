import { mapResult, mapSession } from '../backend-mappers';
import { assessmentRemoteSource, type TriggerAssessmentPayload } from '../sources/remote/assessment.remote-source';
import { type AssessmentSessionEntity } from '../../domain/entities/assessment-session.entity';
import { type IndicatorResultEntity } from '../../domain/entities/indicator-result.entity';

/**
 * Sesi penilaian AMI beserta hasil AI-nya (docs/database.md →
 * `AssessmentSession`, `IndicatorResult`) — dibaca dari Postgres sungguhan
 * lewat NestJS, bukan lagi localStorage.
 *
 * Penjalanan (trigger + tunggu selesai lewat job) dan pembacaan-ulang tinggal
 * di `useAssessmentSession` (mengikuti pola `useChapterGeneration`) — repo ini
 * murni jalur baca + pemicu, tidak memegang state.
 *
 * Koreksi Penjamin Mutu **tidak** ada di sini — tetap repository sendiri di
 * `assessment-verdict.repository.ts`, alasannya sama seperti sebelumnya:
 * umurnya berbeda dari hasil mesin.
 */
export const assessmentSessionRepository = {
	async findByDokumenId(dokumenId: string): Promise<AssessmentSessionEntity[]> {
		const rows = await assessmentRemoteSource.findSessions(dokumenId);
		return rows.map(mapSession);
	},

	async findResultsBySession(sessionId: string): Promise<IndicatorResultEntity[]> {
		const rows = await assessmentRemoteSource.findResults(sessionId);
		return rows.map(mapResult);
	},

	/** Memicu ASSESSMENT_AMI; mengembalikan id job BullMQ untuk dipantau lewat SSE. */
	trigger(dokumenId: string, payload: TriggerAssessmentPayload) {
		return assessmentRemoteSource.trigger(dokumenId, payload);
	},
};
