import { type BuktiDukungRef } from '../domain/entities/bukti-dukung-ref.entity';
import { type ChapterScoreEntity } from '../domain/entities/chapter-score.entity';
import { type RagasMetrik, type RagasScore } from '../domain/entities/ragas-score.entity';
import {
	type BackendBuktiDukungBab,
	type BackendBuktiDukungDraft,
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
		id: row.buktiDukungId,
		namaDokumen: row.namaDokumen,
		tipeFile: row.tipeFile,
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

export function mapHasilSkor(rows: BackendHasilSkorKriteria[] | undefined): ChapterScoreEntity[] {
	return (rows ?? []).map((row) => ({
		id: row.id,
		kriteriaId: row.kriteriaId,
		targetTipe: row.targetTipe,
		babId: row.babId,
		babDraftId: row.babDraftId,
		skorDidapat: row.skorDidapat,
		justifikasi: row.justifikasi ?? '',
		dijalankanOlehUserId: row.dijalankanOlehUserId,
		dijalankanOlehNama: row.dijalankanOlehNama,
		dijalankanPada: row.dijalankanPada,
	}));
}
