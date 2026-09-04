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
 * Fallback untuk baris lama yang ditulis sebelum skor ini dihitung LLM-as-judge
 * (`worker.py::_judge_to_ragas_metrics`) — waktu itu `metrics` masih angka
 * polos tanpa alasan (lihat `create_ragas_score`'s doc lama, port library
 * `ragas` yang tidak pernah kasih alasan per metrik).
 */
const ALASAN_FALLBACK =
	'Dihitung otomatis dari evaluasi mutu jawaban AI untuk generate ini.';

export function mapRagas(row: BackendRagasScore | undefined): RagasScore | null {
	if (!row) return null;

	const metrik = Object.entries(row.metrics).map(([nama, nilai]) => {
		const legacy = typeof nilai === 'number';
		return {
			metrik: nama as RagasMetrik,
			nilai: legacy ? nilai : nilai.nilai,
			alasan: legacy ? ALASAN_FALLBACK : nilai.alasan || ALASAN_FALLBACK,
		};
	});

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
