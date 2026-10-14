import { ApiError } from '~/core/lib/api-client';
import { mapEvalResult, mapResult, mapSession } from '../backend-mappers';
import { assessmentRemoteSource, type TriggerAssessmentPayload } from '../sources/remote/assessment.remote-source';
import { type AssessmentQuality } from '../../domain/entities/assessment-quality.entity';
import { type AssessmentSessionEntity } from '../../domain/entities/assessment-session.entity';
import {
	type IndicatorResultEntity,
	type JudgeStatusSnapshot,
} from '../../domain/entities/indicator-result.entity';

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

	/** Mulai judge on-demand; `indikator` kosong/undefined = seluruh sesi. */
	async runJudge(
		sessionId: string,
		indikator?: { indikatorNo: number; subNo: string }[],
	): Promise<{ judgeId: string; total: number; skipped: number }> {
		// Backend/apps/ai memakai `indicatorNo`; entity web memakai `indikatorNo`.
		const res = await assessmentRemoteSource.runJudge(
			sessionId,
			indikator?.map(({ indikatorNo, subNo }) => ({ indicatorNo: indikatorNo, subNo })),
		);
		return { judgeId: res.judge_id, total: res.total, skipped: res.skipped };
	},

	/** `null` bila apps/ai sudah melupakan judge ini (restart) — bukan galat, lihat assessment-judge-poll.ts. */
	async findJudgeStatus(judgeId: string): Promise<JudgeStatusSnapshot | null> {
		try {
			const row = await assessmentRemoteSource.findJudgeStatus(judgeId);
			return {
				status: row.status,
				total: row.total,
				done: row.done,
				skipped: row.skipped,
				failed: row.failed,
				error: row.error,
			};
		} catch (error) {
			if (error instanceof ApiError && error.status === 404) return null;
			throw error;
		}
	},
};
