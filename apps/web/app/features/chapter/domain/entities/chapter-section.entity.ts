import { z } from 'zod';

// Section outline yang di-generate LLM, dituntun kelompok kriteria rubrik bab ini.
export const chapterSectionStatusEnum = z.enum(['PENDING', 'GENERATING', 'GENERATED', 'ERROR']);
export type ChapterSectionStatus = z.infer<typeof chapterSectionStatusEnum>;

/** Instruksi tabel section (bukan hasil isian) — apa yg harus diisi LLM saat generate, lihat ChapterSection.tableSpec di schema.prisma. */
export const tableSpecEntrySchema = z.object({
	id: z.string(),
	caption: z.string(),
	columns: z.array(z.string()),
});
export type TableSpecEntry = z.infer<typeof tableSpecEntrySchema>;

export const chapterSectionSchema = z.object({
	id: z.string(),
	chapterId: z.string(),
	/** Non-null → ini sub-sub-bab (mis. C.1), anak section ini di bab yang sama. Satu tingkat. */
	parentId: z.string().nullable(),
	urutan: z.number().int().positive(),
	judul: z.string(),
	/** Penomoran asli Panduan ("C.1", "a)"); `null` utk section manual / ekstraksi lama. */
	marker: z.string().nullable(),
	panduan: z.string(),
	/** Pedoman menyebut LKPS (dimas panduan_detail.lkps_needed/lkps_list). */
	lkpsDibutuhkan: z.boolean(),
	tabelLkps: z.array(z.string()),
	status: chapterSectionStatusEnum,
	konten: z.string().nullable(),
	error: z.string().nullable(),
	tableSpec: z.array(tableSpecEntrySchema),
	/** Review per-section (§12.2), sama bentuknya dengan field bab di `ChapterEntity`. */
	terkunci: z.boolean(),
	catatanPenjaminMutu: z.string().nullable(),
	catatanOlehNama: z.string().nullable(),
	catatanPada: z.string().nullable(),
	diajukanReviewPada: z.string().nullable(),
	/** Draft yang sedang aktif; checklist/sumber/penilaian section mengikuti draft ini. Opsional: baris lama/fixture tanpa kolom ini. */
	checkpointAktifId: z.string().nullable().optional(),
});

export type ChapterSectionEntity = z.infer<typeof chapterSectionSchema>;

export const chapterSectionStatusLabels: Record<ChapterSectionStatus, string> = {
	PENDING: 'Belum digenerate',
	GENERATING: 'Sedang digenerate…',
	GENERATED: 'Selesai',
	ERROR: 'Gagal',
};

/** dimas full_title: "C.1 Diferensiasi Misi"; stub yang judulnya = marker tampil sekali. `null` bila tanpa marker. */
export function judulBermarker(s: { marker: string | null; judul: string }): string | null {
	if (!s.marker) return null;
	return s.judul && s.judul !== s.marker ? `${s.marker} ${s.judul}` : s.marker;
}
