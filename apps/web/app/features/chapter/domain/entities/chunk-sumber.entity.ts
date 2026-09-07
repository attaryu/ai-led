import { z } from 'zod';

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
	jenis: z.enum(['led', 'evidence']),
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
} | null;
