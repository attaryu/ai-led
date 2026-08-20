import { type AssessmentSessionEntity } from '../domain/entities/assessment-session.entity';
import { type AssessmentVerdictEntity } from '../domain/entities/assessment-verdict.entity';
import { type IndicatorResultEntity } from '../domain/entities/indicator-result.entity';
import {
	type BackendAssessmentSession,
	type BackendAssessmentVerdict,
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
		dokumenId: row.dokumenId,
		sumber: {
			sumberLed: row.sumberLed,
			ledFileName: row.ledFileName,
			lkpsBuktiDukungId: row.lkpsBuktiDukungId,
			laporanBuktiDukungId: row.laporanBuktiDukungId,
		},
		totalIndicators: row.totalIndicators,
		completedIndicators: row.completedIndicators,
		status: row.status,
		error: row.error,
		dijalankanOlehUserId: row.createdByUserId,
		dijalankanOlehNama: row.createdBy.namaLengkap,
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

export function mapVerdict(row: BackendAssessmentVerdict): AssessmentVerdictEntity {
	return {
		id: row.id,
		dokumenId: row.dokumenId,
		indikatorNo: row.indikatorNo,
		skorFinal: Number(row.skorFinal),
		catatan: row.catatan ?? '',
		skorMesinSaatDitinjau: toNumber(row.skorMesinSaatDitinjau),
		sesiIdSaatDitinjau: row.sesiIdSaatDitinjau,
		ditinjauOlehUserId: row.ditinjauOlehUserId,
		ditinjauOlehNama: row.ditinjauOlehNama,
		ditinjauPada: row.ditinjauPada,
	};
}
