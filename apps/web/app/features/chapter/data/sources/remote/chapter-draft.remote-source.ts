import { mapBuktiDukungRef, mapKontenBody, mapRagas } from '../../backend-mappers';
import { type ChapterDraftEntity } from '../../../domain/entities/chapter-draft.entity';
import { chapterRemoteSource, type BackendBabDraft } from './chapter.remote-source';

/** Dipakai juga `use-chapter-score.ts`, yang butuh `hasilSkorKriteria` mentah di samping bentuk ini. */
export function mapBabDraft(row: BackendBabDraft): ChapterDraftEntity {
	return {
		id: row.id,
		chapterId: row.chapterId,
		versi: row.version,
		label: row.label,
		kontenSnapshot: mapKontenBody(row.contentSnapshot) ?? '',
		sumber: row.source,
		buktiDukung: mapBuktiDukungRef(row.buktiDukungDraft),
		referensiChunkIds: row.referenceChunkIds
			? row.referenceChunkIds.split(',').filter(Boolean)
			: [],
		// Sebuah checkpoint hanya pernah dinilai sekali (worker menulis satu
		// RagasScore per generate, lihat db/generation_client.py::create_ragas_score),
		// jadi indeks 0 sudah cukup tanpa perlu memilih yang terbaru.
		ragas: mapRagas(row.ragasScores[0]),
		dibuatOlehUserId: row.createdByUserId,
		dibuatOlehNama: row.createdByName,
		dibuatPada: row.createdAt,
	};
}

/**
 * Riwayat checkpoint bab dari backend sungguhan — dipakai tab Rujukan/Kualitas
 * AI/Rubrik, yang semuanya cuma perlu **membaca** daftar checkpoint (bukan
 * membuat/memulihkan). Sengaja tidak menggantikan
 * `chapterDraftRepository` (tab Draft): itu masih memegang jalur buat/pulihkan
 * yang belum berbicara ke backend — celah ini dicatat, bukan ditutupi diam-diam.
 */
export const chapterDraftRemoteSource = {
	async findByChapterId(babId: string): Promise<ChapterDraftEntity[]> {
		const rows = await chapterRemoteSource.findDrafts(babId);
		return rows.map(mapBabDraft);
	},
};
