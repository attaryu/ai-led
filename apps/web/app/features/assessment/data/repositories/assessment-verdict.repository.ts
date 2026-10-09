import { mapVerdict } from '../backend-mappers';
import { assessmentRemoteSource } from '../sources/remote/assessment.remote-source';
import { type AssessmentVerdictEntity } from '../../domain/entities/assessment-verdict.entity';

/**
 * Keputusan Penjamin Mutu — penilaian final (docs/database.md §12b, tabel
 * `assessment_verdicts` sekarang ada — lihat migrasi
 * 20260820100000_add_assessment_verdicts). Dibaca/ditulis lewat NestJS,
 * bukan lagi localStorage.
 *
 * `skorMesinSaatDitinjau`/`sesiIdSaatDitinjau` **tidak** dikirim dari sini —
 * backend yang mengisinya dari sesi terbaru dokumen ini saat upsert
 * (assessment.service.ts::upsertVerdict), supaya provenance-nya tidak bisa
 * dipalsukan lewat body yang dibentuk manual.
 */
export const assessmentVerdictRepository = {
	async findByDokumenId(dokumenId: string): Promise<AssessmentVerdictEntity[]> {
		const rows = await assessmentRemoteSource.findVerdicts(dokumenId);
		return rows.map(mapVerdict);
	},

	async upsert(input: {
		dokumenId: string;
		indikatorNo: number;
		subNo?: string;
		skorFinal: number;
		catatan: string;
	}): Promise<AssessmentVerdictEntity> {
		const row = await assessmentRemoteSource.upsertVerdict(input.dokumenId, {
			indicatorNo: input.indikatorNo,
			subNo: input.subNo || undefined,
			finalScore: input.skorFinal,
			note: input.catatan.trim() === '' ? undefined : input.catatan,
		});
		return mapVerdict(row);
	},

	remove(dokumenId: string, indikatorNo: number, subNo = ''): Promise<void> {
		return assessmentRemoteSource.removeVerdict(dokumenId, indikatorNo, subNo);
	},
};
