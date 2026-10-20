import type { JSONContent } from '@tiptap/core';
import { docToHtml, htmlToDoc, isProseDoc } from './prose-content';
import { type BuktiDukungRef } from '../domain/entities/bukti-dukung-ref.entity';
import { type ChapterScoreEntity } from '../domain/entities/chapter-score.entity';
import { type ChapterSectionEntity } from '../domain/entities/chapter-section.entity';
import { type SectionOverviewEntity } from '../domain/entities/section-overview.entity';
import { type SectionSumber } from '../domain/entities/chunk-sumber.entity';
import { type DocumentRecommendationEntity } from '../domain/entities/document-recommendation.entity';
import { ragasMetrikEnum, type RagasMetrik, type RagasScore } from '../domain/entities/ragas-score.entity';
import {
	type BackendBuktiDukungBab,
	type BackendBuktiDukungDraft,
	type BackendChapterSection,
	type BackendSectionOverview,
	type BackendDocumentRecommendation,
	type BackendHasilSkorKriteria,
	type BackendRagasScore,
	type BackendSectionSumber,
} from './sources/remote/chapter.remote-source';

/**
 * Kumpulan pemetaan baris backend -> entitas domain yang dipakai lebih dari
 * satu repository (`chapter.repository.ts` untuk kondisi aktif,
 * `chapter-draft.repository.ts` untuk tiap checkpoint) — ditaruh sekali di
 * sini alih-alih disalin di keduanya.
 */

/**
 * Konten backend (dokumen ProseMirror; baris lama `{format:'html', body}` masih
 * terbaca) -> string HTML untuk kanvas. `null` untuk `{}` kosong bawaan baris
 * baru — dibedakan dari `''` yang berarti user pernah menulis lalu menghapus
 * semuanya.
 */
export function mapKontenBody(konten: unknown): string | null {
	if (isProseDoc(konten)) return docToHtml(konten);
	return typeof konten === 'object' &&
		konten !== null &&
		typeof (konten as { body?: unknown }).body === 'string'
		? (konten as { body: string }).body
		: null;
}

/** Kebalikan {@link mapKontenBody} — dipakai menulis `kontenKerja`/isi section ke backend. */
export function toKontenBody(html: string): JSONContent {
	return htmlToDoc(html);
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
// ponytail: dulu 'Dihitung otomatis dari evaluasi mutu jawaban AI untuk generate ini.' -- kotak alasan
// kini disembunyikan bila tidak ada alasannya, jadi cadangannya string kosong.
const ALASAN_FALLBACK = '';

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
		chapterSectionId: row.chapterSectionId,
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
				status: item.status,
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

export function mapSectionSumber(row: BackendSectionSumber): SectionSumber {
	if (!row) return null;
	return {
		chunks: row.chunksUsed.map((chunk) => ({
			label: chunk.citation_label,
			teks: chunk.text,
			jenis: chunk.kind,
			fileUrl: chunk.fileUrl,
			buktiDukungId: chunk.bukti_dukung_id ?? null,
			bagian: chunk.entity?.trim() || null,
		})),
		digenerateAt: row.generatedAt,
		selectedEvidenceIds: row.selectedEvidenceIds ?? [],
		ragas: ragasDariJudge(row.judgeResult, row.chunksUsed.length, row.generatedAt),
		judgeError: typeof row.judgeResult?.error === 'string' ? row.judgeResult.error : null,
		judgeTertunda: row.judgeResult?.pending === true,
		checklist: row.checklist ?? [],
		checklistError: row.checklistError ?? null,
		model: row.model ?? null,
		latensiDetik: row.latencySec ?? null,
	};
}

/** Sama dengan worker.py::_judge_to_ragas_metrics: semua-atau-tidak sama sekali. */
function ragasDariJudge(
	judge: Record<string, unknown> | null | undefined,
	jumlahChunk: number,
	dihitungPada: string,
): RagasScore | null {
	if (!judge || 'error' in judge) return null;
	const alasan = (judge.reasoning ?? {}) as Record<string, string>;
	// context_recall opsional: skor dari library RAGAS tidak punya jawaban acuan untuk menghitungnya,
	// jadi hanya tiga metrik pertama yang wajib; yang lain ikut tampil bila ada.
	const metrik = ragasMetrikEnum.options
		.filter((nama) => nama !== 'context_recall' || typeof judge[nama] === 'number')
		.map((nama) => ({
			metrik: nama,
			nilai: judge[nama],
			alasan: alasan[nama] || ALASAN_FALLBACK,
		}));
	if (metrik.some((m) => typeof m.nilai !== 'number')) return null;
	return { metrik: metrik as RagasScore['metrik'], jumlahChunk, dihitungPada };
}

export function mapChapterSection(row: BackendChapterSection): ChapterSectionEntity {
	return {
		id: row.id,
		chapterId: row.chapterId,
		parentId: row.parentId,
		urutan: row.order,
		judul: row.title,
		marker: row.marker ?? null,
		panduan: row.guidance,
		lkpsDibutuhkan: row.lkpsNeeded ?? false,
		tabelLkps: row.lkpsList ?? [],
		status: row.status,
		konten: mapKontenBody(row.content),
		error: row.error,
		tableSpec: row.tableSpec ?? [],
		terkunci: row.locked,
		catatanPenjaminMutu: row.qualityAssuranceNote,
		catatanOlehNama: row.notedByName,
		catatanPada: row.notedAt,
		diajukanReviewPada: row.reviewSubmittedAt,
		checkpointAktifId: row.activeCheckpointId ?? null,
	};
}

/** Tahan backend lama yang belum mengirim `sections`: dianggap tanpa sub-bab. */
export function mapSectionOverview(
	rows: BackendSectionOverview[] | undefined,
): SectionOverviewEntity[] {
	return (rows ?? []).map((row) => ({
		id: row.id,
		parentId: row.parentId,
		urutan: row.order,
		judul: row.title,
		marker: row.marker,
		status: row.status,
		error: row.error,
		terkunci: row.locked,
		diajukanReviewPada: row.reviewSubmittedAt,
		catatanPenjaminMutu: row.qualityAssuranceNote,
		catatanOlehNama: row.notedByName,
		catatanPada: row.notedAt,
	}));
}
