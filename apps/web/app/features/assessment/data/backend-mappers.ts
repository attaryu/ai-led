import {
	type AmiRagasMetrik,
	type AssessmentQuality,
} from '../domain/entities/assessment-quality.entity';
import { type AssessmentSessionEntity } from '../domain/entities/assessment-session.entity';
import { type AssessmentVerdictEntity } from '../domain/entities/assessment-verdict.entity';
import { type IndicatorResultEntity } from '../domain/entities/indicator-result.entity';
import {
	type BackendAssessmentSession,
	type BackendAssessmentVerdict,
	type BackendEvalResult,
	type BackendIndicatorResult,
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
		// RAGAS di level sesi (docs §12b) belum ada backing-nya sama sekali —
		// bukan "belum dihitung", tapi genuinely tidak ada kolomnya di Postgres.
		kualitas: null,
	};
}

export function mapResult(row: BackendIndicatorResult): IndicatorResultEntity {
	return {
		id: row.id,
		sesiId: row.sessionId,
		indikatorNo: row.indicatorNo,
		skor: toNumber(row.score),
		justifikasi: row.justification ?? '',
		confidence: toNumber(row.confidence),
		rekomendasi: row.recommendation,
		error: row.error,
		dinilaiPada: row.createdAt,
	};
}

/** RAGAS asli tidak menyertakan alasan per metrik (angkanya murni numerik) — sama seperti chapter/ragas-score, lihat backend-mappers.ts fitur chapter. */
const ALASAN_RAGAS_PENILAIAN =
	'Dihitung otomatis oleh evaluasi RAGAS terhadap potongan sumber (LED, LKPS, bukti dukung) yang diambil untuk penilaian ini.';

/** `null` bila evaluasi belum selesai (`status` masih `pending`/`running`) atau gagal. */
export function mapEvalResult(row: BackendEvalResult): AssessmentQuality | null {
	if (row.status !== 'completed' || !row.scores || !row.per_indicator || !row.model) {
		return null;
	}

	const metrik = (Object.entries(row.scores) as [AmiRagasMetrik, number][]).map(
		([nama, nilai]) => ({ metrik: nama, nilai, alasan: ALASAN_RAGAS_PENILAIAN }),
	);

	const perIndikator = row.per_indicator
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
		jumlahChunk: row.total_chunks ?? 0,
		judgeModel: row.model,
		dihitungPada: row.finished_at ?? new Date().toISOString(),
	};
}

export function mapVerdict(row: BackendAssessmentVerdict): AssessmentVerdictEntity {
	return {
		id: row.id,
		dokumenId: row.documentId,
		indikatorNo: row.indicatorNo,
		skorFinal: Number(row.finalScore),
		catatan: row.note ?? '',
		skorMesinSaatDitinjau: toNumber(row.machineScoreAtReview),
		sesiIdSaatDitinjau: row.sessionIdAtReview,
		ditinjauOlehUserId: row.reviewedByUserId,
		ditinjauOlehNama: row.reviewedByName,
		ditinjauPada: row.reviewedAt,
	};
}
