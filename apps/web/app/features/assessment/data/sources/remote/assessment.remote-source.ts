import { apiFetch } from '~/core/lib/api-client';
import { type LedSourceMode } from '../../../domain/entities/assessment-source.entity';

/** Baris Prisma `AssessmentSession`, dengan `createdBy.fullName` di-include. */
export type BackendAssessmentSession = {
	id: string;
	documentId: string;
	createdByUserId: string;
	reportEvidenceId: string | null;
	ledSource: LedSourceMode;
	ledFileName: string | null;
	lkpsEvidenceId: string | null;
	totalIndicators: number;
	completedIndicators: number;
	status: 'RUNNING' | 'COMPLETED' | 'FAILED';
	error: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: { fullName: string };
};

/** Baris Prisma `IndicatorResult` — `score`/`confidence` Decimal datang sebagai string. */
export type BackendIndicatorResult = {
	id: string;
	sessionId: string;
	indicatorNo: number;
	score: string | null;
	justification: string | null;
	confidence: string | null;
	recommendation: string | null;
	error: string | null;
	createdAt: string;
};

export type BackendReasoningStep = {
	id: string;
	sessionId: string;
	indicatorNo: number;
	stepIndex: number;
	content: string;
	createdAt: string;
};

/** Baris Prisma `AssessmentVerdict`. */
export type BackendAssessmentVerdict = {
	id: string;
	documentId: string;
	indicatorNo: number;
	finalScore: string;
	note: string | null;
	machineScoreAtReview: string | null;
	sessionIdAtReview: string;
	reviewedByUserId: string;
	reviewedByName: string;
	reviewedAt: string;
};

export type BackendJob = {
	id: string;
	queueName: string;
	bullJobId: string;
	status: 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
};

export type TriggerAssessmentPayload = {
	indikatorList?: number[];
	sumberLed?: LedSourceMode;
	ledFileName?: string;
	lkpsBuktiDukungId?: string;
	laporanBuktiDukungId?: string;
};

export type UpsertVerdictPayload = {
	indicatorNo: number;
	finalScore: number;
	note?: string;
};

/** Baris `IndicatorListItem` (apps/ai) — matriks rubrik AMI, bukan tabel Postgres. */
export type AssessmentIndicator = {
	no: number;
	kriteria: string;
};

export const assessmentRemoteSource = {
	/** 78 indikator AMI, dipakai pemilih tag indikator di unggah bukti dukung. */
	findIndicators(): Promise<AssessmentIndicator[]> {
		return apiFetch<AssessmentIndicator[]>('/assessment/indicators');
	},

	findSessions(dokumenId: string): Promise<BackendAssessmentSession[]> {
		return apiFetch<BackendAssessmentSession[]>(
			`/dokumen/${dokumenId}/assessment-sessions`,
		);
	},

	findResults(sessionId: string): Promise<BackendIndicatorResult[]> {
		return apiFetch<BackendIndicatorResult[]>(
			`/assessment-sessions/${sessionId}/results`,
		);
	},

	findReasoning(
		sessionId: string,
		indicatorNo: number,
	): Promise<BackendReasoningStep[]> {
		return apiFetch<BackendReasoningStep[]>(
			`/assessment-sessions/${sessionId}/reasoning?indicatorNo=${indicatorNo}`,
		);
	},

	findVerdicts(dokumenId: string): Promise<BackendAssessmentVerdict[]> {
		return apiFetch<BackendAssessmentVerdict[]>(
			`/dokumen/${dokumenId}/assessment-verdicts`,
		);
	},

	upsertVerdict(
		dokumenId: string,
		payload: UpsertVerdictPayload,
	): Promise<BackendAssessmentVerdict> {
		return apiFetch<BackendAssessmentVerdict>(
			`/dokumen/${dokumenId}/assessment-verdicts`,
			{ method: 'POST', body: payload },
		);
	},

	removeVerdict(dokumenId: string, indikatorNo: number): Promise<void> {
		return apiFetch<void>(
			`/dokumen/${dokumenId}/assessment-verdicts/${indikatorNo}`,
			{ method: 'DELETE' },
		);
	},

	/** Memicu ASSESSMENT_AMI (Producer NestJS -> Worker FastAPI). */
	trigger(dokumenId: string, payload: TriggerAssessmentPayload): Promise<BackendJob> {
		return apiFetch<BackendJob>(`/dokumen/${dokumenId}/assessment`, {
			method: 'POST',
			body: payload,
		});
	},
};
