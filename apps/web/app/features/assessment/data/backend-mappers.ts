import {
	type AmiRagasMetrik,
	type AssessmentQuality,
} from '../domain/entities/assessment-quality.entity';
import { type AssessmentSessionEntity } from '../domain/entities/assessment-session.entity';
import { type AssessmentVerdictEntity } from '../domain/entities/assessment-verdict.entity';
import {
	type IndicatorResultEntity,
	type JudgeVerdictEntity,
} from '../domain/entities/indicator-result.entity';
import {
	type BackendAssessmentSession,
	type BackendAssessmentVerdict,
	type BackendEvalResult,
	type BackendIndicatorResult,
	type BackendSessionQuality,
} from './sources/remote/assessment.remote-source';

/** Prisma Decimal datang lewat JSON sebagai string — `null`/`''` tetap `null`. */
function toNumber(value: string | null): number | null {
	if (value === null) return null;
	const n = Number(value);
	return Number.isNaN(n) ? null : n;
}

export function mapSession(row: BackendAssessmentSession): AssessmentSessionEntity {
	return {
		id: row.id,
		dokumenId: row.documentId,
		sumber: {
			sumberLed: row.ledSource,
			ledFileName: row.ledFileName,
			lkpsBuktiDukungId: row.lkpsEvidenceId,
			laporanBuktiDukungId: row.reportEvidenceId,
		},
		totalIndicators: row.totalIndicators,
		completedIndicators: row.completedIndicators,
		status: row.status,
		error: row.error,
		dijalankanOlehUserId: row.createdByUserId,
		dijalankanOlehNama: row.createdBy.fullName,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		kualitas: row.kualitas ? buildAssessmentQuality(row.kualitas) : null,
		jobId: row.bullJobId,
	};
}

function daftarString(nilai: unknown): string[] {
	return Array.isArray(nilai) ? nilai.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Verdict judge apps/ai (snake_case, JSON bebas) -> entity. `null` untuk "belum dijudge" maupun
 * bentuk yang tidak bisa dipercaya (mis. `{error: ...}`, `grounded` bukan boolean) — lebih baik
 * tampil "Belum dijudge" daripada memajang verdict rusak.
 */
export function mapJudgeVerdict(
	mentah: Record<string, unknown> | null | undefined,
): JudgeVerdictEntity | null {
	if (!mentah || typeof mentah.grounded !== 'boolean') return null;
	return {
		grounded: mentah.grounded,
		klaimTakTerdukung: daftarString(mentah.hallucinated_claims),
		faktaTerlewat: daftarString(mentah.missing_facts),
		catatan: typeof mentah.notes === 'string' ? mentah.notes : '',
		model: typeof mentah.judge_model === 'string' ? mentah.judge_model : null,
		dinilaiPada: typeof mentah.judged_at === 'string' ? mentah.judged_at : null,
	};
}

export function mapResult(row: BackendIndicatorResult): IndicatorResultEntity {
	return {
		id: row.id,
		sesiId: row.sessionId,
		indikatorNo: row.indicatorNo,
		subNo: row.subNo ?? '',
		skor: toNumber(row.score),
		justifikasi: row.justification ?? '',
		confidence: toNumber(row.confidence),
		rekomendasi: row.recommendation,
		error: row.error,
		judge: mapJudgeVerdict(row.judgeVerdict),
		dinilaiPada: row.createdAt,
	};
}

/** RAGAS asli tidak menyertakan alasan per metrik (angkanya murni numerik) — sama seperti chapter/ragas-score, lihat backend-mappers.ts fitur chapter. */
const ALASAN_RAGAS_PENILAIAN =
	'Dihitung otomatis oleh evaluasi RAGAS terhadap potongan sumber (LED, LKPS, bukti dukung) yang diambil untuk penilaian ini.';

/**
 * Dipakai baik untuk hasil `POST /eval/run` yang baru selesai (`mapEvalResult`)
 * maupun untuk `AssessmentSession.kualitas` yang sudah tersimpan (`mapSession`)
 * — keduanya persis bentuk `BackendSessionQuality`, jadi satu konversi cukup.
 */
function buildAssessmentQuality(quality: BackendSessionQuality): AssessmentQuality {
	const metrik = (Object.entries(quality.scores) as [AmiRagasMetrik, number][]).map(
		([nama, nilai]) => ({ metrik: nama, nilai, alasan: ALASAN_RAGAS_PENILAIAN }),
	);

	const perIndikator = quality.per_indicator
		.filter(
			(item): item is typeof item & { context_recall: number; faithfulness: number } =>
				item.context_recall !== undefined && item.faithfulness !== undefined,
		)
		.map((item) => ({
			indikatorNo: item.indicator_no,
			contextRecall: item.context_recall,
			faithfulness: item.faithfulness,
		}));

	return {
		metrik,
		perIndikator,
		jumlahChunk: quality.total_chunks ?? 0,
		judgeModel: quality.model,
		dihitungPada: quality.finished_at,
	};
}

/** `null` bila evaluasi belum selesai (`status` masih `pending`/`running`) atau gagal. */
export function mapEvalResult(row: BackendEvalResult): AssessmentQuality | null {
	if (row.status !== 'completed' || !row.scores || !row.per_indicator || !row.model) {
		return null;
	}

	return buildAssessmentQuality({
		scores: row.scores,
		per_indicator: row.per_indicator,
		total_chunks: row.total_chunks,
		model: row.model,
		finished_at: row.finished_at ?? new Date().toISOString(),
	});
}

export function mapVerdict(row: BackendAssessmentVerdict): AssessmentVerdictEntity {
	return {
		id: row.id,
		dokumenId: row.documentId,
		indikatorNo: row.indicatorNo,
		subNo: row.subNo ?? '',
		skorFinal: Number(row.finalScore),
		catatan: row.note ?? '',
		skorMesinSaatDitinjau: toNumber(row.machineScoreAtReview),
		sesiIdSaatDitinjau: row.sessionIdAtReview,
		ditinjauOlehUserId: row.reviewedByUserId,
		ditinjauOlehNama: row.reviewedByName,
		ditinjauPada: row.reviewedAt,
	};
}
