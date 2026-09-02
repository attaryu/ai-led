import { type BuktiDukungRef } from '../domain/entities/bukti-dukung-ref.entity';
import { type ChapterScoreEntity } from '../domain/entities/chapter-score.entity';
import { type ChapterSectionEntity } from '../domain/entities/chapter-section.entity';
import { type DocumentRecommendationEntity } from '../domain/entities/document-recommendation.entity';
import { type RagasMetrik, type RagasScore } from '../domain/entities/ragas-score.entity';
import {
	type BackendBuktiDukungBab,
	type BackendBuktiDukungDraft,
	type BackendChapterSection,
	type BackendDocumentRecommendation,
	type BackendHasilSkorKriteria,
	type BackendRagasScore,
} from './sources/remote/chapter.remote-source';

/**
 * Kumpulan pemetaan baris backend -> entitas domain yang dipakai lebih dari
 * satu repository (`chapter.repository.ts` untuk kondisi aktif,
 * `chapter-draft.repository.ts` untuk tiap checkpoint) — ditaruh sekali di
 * sini alih-alih disalin di keduanya.
 */

/**
 * `{format:'html', body}` -> string HTML, sama konvensi dengan `kontenKerja`
 * bab. `null` untuk bentuk lain (termasuk `{}` kosong bawaan baris baru) —
 * dibedakan dari `body` yang kebetulan string kosong, yang berarti user
 * pernah menulis lalu menghapus semuanya.
 */
export function mapKontenBody(konten: unknown): string | null {
	return typeof konten === 'object' &&
		konten !== null &&
		typeof (konten as { body?: unknown }).body === 'string'
		? (konten as { body: string }).body
		: null;
}

/** Kebalikan {@link mapKontenBody} — dipakai menulis `kontenKerja` lewat `PATCH bab/:id`. */
export function toKontenBody(html: string): { format: 'html'; body: string } {
	return { format: 'html', body: html };
}

export function mapBuktiDukungRef(
	rows: BackendBuktiDukungBab[] | BackendBuktiDukungDraft[] | undefined,
): BuktiDukungRef[] {
	return (rows ?? []).map((row) => ({
		id: row.evidenceId,
		namaDokumen: row.documentName,
		tipeFile: row.fileType,
	}));
}

/**
 * RAGAS asli tidak menyertakan alasan per metrik — angkanya murni numerik
 * (lihat `eval/ragas_eval.py::score_single_sample`). Diisi kalimat metodologi
 * yang sama untuk ketiganya, bukan mengarang alasan spesifik yang tidak
 * pernah dihasilkan model manapun.
 */
const ALASAN_RAGAS =
	'Dihitung otomatis oleh evaluasi RAGAS terhadap potongan sumber yang diambil untuk generate ini.';

export function mapRagas(row: BackendRagasScore | undefined): RagasScore | null {
	if (!row) return null;

	const metrik = Object.entries(row.metrics).map(([nama, nilai]) => ({
		metrik: nama as RagasMetrik,
		nilai,
		alasan: ALASAN_RAGAS,
	}));

	return {
		metrik,
		jumlahChunk: row.chunkCount,
		dihitungPada: row.computedAt,
	};
}

/**
 * `selectedEvidenceIds` adalah `Json` bebas bentuk di Prisma — baris yang
 * belum pernah dikonfirmasi menyimpan larik kosong lewat `create_document_recommendation`
 * (apps/ai), tapi tidak ada yang menjamin bentuknya di level tipe. Larik non-string
 * jatuh ke kosong alih-alih melempar, mengikuti kebiasaan `mapKontenBody` di atas.
 */
export function mapDocumentRecommendation(
	row: BackendDocumentRecommendation,
): DocumentRecommendationEntity {
	return {
		id: row.id,
		chapterDraftId: row.chapterDraftId,
		recommendationText: row.recommendationText,
		selectedEvidenceIds: Array.isArray(row.selectedEvidenceIds)
			? row.selectedEvidenceIds.filter((id): id is string => typeof id === 'string')
			: [],
		status: row.status,
		items: (row.items ?? [])
			.map((item) => ({
				id: item.id,
				label: item.label,
				reason: item.reason,
				order: item.order,
			}))
			.sort((a, b) => a.order - b.order),
	};
}

export function mapHasilSkor(rows: BackendHasilSkorKriteria[] | undefined): ChapterScoreEntity[] {
	return (rows ?? []).map((row) => ({
		id: row.id,
		kriteriaId: row.criterionId,
		targetTipe: row.targetType,
		babId: row.chapterId,
		babDraftId: row.draftId,
		skorDidapat: row.scoreObtained,
		justifikasi: row.justification ?? '',
		dijalankanOlehUserId: row.runByUserId,
		dijalankanOlehNama: row.runByName,
		dijalankanPada: row.runAt,
	}));
}

export function mapChapterSection(row: BackendChapterSection): ChapterSectionEntity {
	return {
		id: row.id,
		chapterId: row.chapterId,
		parentId: row.parentId,
		urutan: row.order,
		judul: row.title,
		panduan: row.guidance,
		status: row.status,
		konten: mapKontenBody(row.content),
		error: row.error,
	};
}
