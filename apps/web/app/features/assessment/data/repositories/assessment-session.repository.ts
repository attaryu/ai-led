import { mapEvalResult, mapResult, mapSession } from '../backend-mappers';
import { assessmentRemoteSource, type TriggerAssessmentPayload } from '../sources/remote/assessment.remote-source';
import { type AssessmentQuality } from '../../domain/entities/assessment-quality.entity';
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

	/** Hasil terbaru per indikator lintas semua sesi dokumen ini — lihat use-assessment-results.ts. */
	async findResultsByDokumenId(dokumenId: string): Promise<IndicatorResultEntity[]> {
		const rows = await assessmentRemoteSource.findResultsForDocument(dokumenId);
		return rows.map(mapResult);
	},

	/** Memicu ASSESSMENT_AMI; mengembalikan id job BullMQ untuk dipantau lewat SSE. */
	trigger(dokumenId: string, payload: TriggerAssessmentPayload) {
		return assessmentRemoteSource.trigger(dokumenId, payload);
	},

	/** Minta job yang sedang berjalan berhenti — lihat catatan di remote-source. */
	cancel(jobId: string) {
		return assessmentRemoteSource.cancel(jobId);
	},

	/** Mulai evaluasi RAGAS atas sesi ini, balikin id evaluasi untuk dipantau lewat `findEvalResult`. */
	async runEval(sessionId: string, nIndicators: number): Promise<string> {
		const { eval_id: evalId } = await assessmentRemoteSource.runEval(
			sessionId,
			nIndicators,
		);
		return evalId;
	},

	/** Poll satu evaluasi RAGAS — `kualitas` cuma terisi saat `status === 'completed'`. */
	async findEvalResult(evalId: string): Promise<{
		status: 'pending' | 'running' | 'completed' | 'failed';
		kualitas: AssessmentQuality | null;
		error: string | null;
	}> {
		const row = await assessmentRemoteSource.findEvalResult(evalId);
		return {
			status: row.status,
			kualitas: mapEvalResult(row),
			error: row.error,
		};
	},
};
