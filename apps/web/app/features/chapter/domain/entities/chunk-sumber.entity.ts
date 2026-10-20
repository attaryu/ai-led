import { z } from 'zod';

import { type RagasScore } from './ragas-score.entity';

/**
 * Satu chunk (potongan sumber) yang benar-benar dipakai AI menyusun SATU
 * section — backing citation hover-card di editor (klik/hover "(sumber: X)"
 * di dalam narasi menampilkan isi X yang sebenarnya).
 *
 * Diturunkan dari `GenerationRun.chunksUsed` (worker.py::_handle_generasi_bab)
 * lewat `GET bab/:id/sections/:sectionId/sumber` — BUKAN mock. `label` sudah
 * berupa string PERSIS yang tampil di "(sumber: ...)" narasinya (dihitung
 * sekali di worker.py, bukan diturunkan ulang di sini), jadi mencocokkan
 * kartu ke sitasi tinggal `=== `, tanpa logika folder-name-preference dobel.
 */
export const chunkSumberSchema = z.object({
	label: z.string(),
	teks: z.string(),
	/**
	 * `lkps` = sheet LKPS yang dipakai (dimas Referensi: LKPS per sheet + evidence).
	 * `narasi` = narasi draft aktif subbab lain yang dilampirkan ke analisis SWOT (tanpa RAG).
	 */
	jenis: z.enum(['led', 'evidence', 'lkps', 'narasi']),
	/** R2 object key (`EvidenceEntity.fileUrl`) -- `null` utk chunk LED atau evidence yang sudah dihapus. Dipakai hover-card utk tombol "Buka berkas". */
	fileUrl: z.string().nullable(),
	/** Id bukti dukung asal chunk evidence; `null` utk chunk LED. */
	buktiDukungId: z.string().nullable(),
	/** Judul bagian/heading chunk (tab Bukti); `null` bila tidak dicatat. */
	bagian: z.string().nullable().optional(),
});
export type ChunkSumberEntity = z.infer<typeof chunkSumberSchema>;

/**
 * `null` = section ini belum pernah digenerate lewat job GENERASI_BAB (ditulis
 * manual, atau digenerate sebelum kolom `section_id` ada) — beda dari array
 * kosong, yang berarti "digenerate tapi tidak ada bukti terpakai".
 */
export type SectionSumber = {
	chunks: ChunkSumberEntity[];
	digenerateAt: string;
	/** Bukti dukung yang dipilih saat generate itu. */
	selectedEvidenceIds: string[];
	/** Judge milik generate section ini (dimas: Kualitas per section); `null` bila judge gagal/tidak ada. */
	ragas: RagasScore | null;
	judgeError: string | null;
	/** `true` = skor RAGAS belum selesai dihitung (penilaian susulan masih berjalan atau tidak selesai). */
	judgeTertunda: boolean;
	/** Butir checklist pencarian fakta generate terakhir (yang dipakai retrieval); kosong bila tahapnya gagal. */
	checklist: string[];
	checklistError: string | null;
	model: string | null;
	latensiDetik: number | null;
} | null;
