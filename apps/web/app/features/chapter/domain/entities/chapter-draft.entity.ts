import { z } from 'zod';

import { buktiDukungRefSchema } from './bukti-dukung-ref.entity';
import { ragasScoreSchema } from './ragas-score.entity';

/**
 * Satu checkpoint bab (docs/database.md → BAB_DRAFT, docs/application_flow.md §8).
 *
 * Pasangan permanen dari {@link ../entities/chapter.entity ChapterEntity}: yang itu
 * kondisi aktif yang terus ditimpa autosave, yang ini titik pulih yang **tidak
 * pernah berubah** sesudah dibuat. Ketiadaan `update`/`delete` di repository-nya
 * bukan kelalaian — §8.1 melarang penghapusan karena checkpoint adalah jejak audit
 * akreditasi, dan `kontenSnapshot` memang tidak boleh bisa disunting.
 */
export const chapterDraftSumberEnum = z.enum(['AI', 'MANUAL']);
export type ChapterDraftSumber = z.infer<typeof chapterDraftSumberEnum>;

export const chapterDraftSchema = z.object({
	id: z.string(),
	chapterId: z.string(),
	/**
	 * Nomor urut checkpoint **dalam satu bab**, mulai dari 1. Ditentukan
	 * repository, tidak pernah oleh pemanggil: itu satu-satunya cara menjamin dua
	 * checkpoint tidak lahir dengan nomor yang sama.
	 */
	versi: z.number().int().positive(),
	/** `null` bila user tidak memberi nama; tampilan jatuh ke {@link labelDraft}. */
	label: z.string().nullable(),
	/**
	 * Salinan `kontenKerja` saat checkpoint dibuat — HTML, format yang sama dengan
	 * aslinya (lihat alasan pemilihan HTML di `chapter.entity.ts`).
	 */
	kontenSnapshot: z.string(),
	/**
	 * **Asal isi, bukan siapa pembuatnya.** Dua kolom ini paling mudah tertukar,
	 * jadi ditulis di sini sekali untuk selamanya:
	 *
	 * - `dibuatOlehUserId` menjawab **siapa**. Ia terisi untuk keduanya —
	 *   docs/database.md menyebutnya "User yang membuat checkpoint (memicu generate
	 *   AI maupun menyimpan manual)" — jadi checkpoint bersumber `AI` pun tetap
	 *   punya pemilik manusia, yaitu orang yang menekan Generate.
	 * - `sumber` menjawab **dari mana isinya berasal**.
	 *
	 * Praktiknya ia merekam tombol mana yang ditekan: `AI` hanya lahir dari tautan
	 * "Simpan sebagai draft" di tab Generasi, yang berdiri tepat di tempat hasil
	 * generate muncul. Checkpoint dari tab Draft selalu `MANUAL`.
	 */
	sumber: chapterDraftSumberEnum,
	/**
	 * Denormalisasi `BUKTI_DUKUNG_DRAFT`, dengan alasan yang sama seperti
	 * `ChapterEntity.buktiDukung`: sumber datanya masih localStorage, dan saat
	 * pindah ke API ini kembali jadi tabel relasi. Bedanya dari yang di bab —
	 * daftar ini **permanen**, tidak ikut berubah saat pilihan bukti dukung aktif
	 * diganti. Itulah yang membuat checkpoint jadi arsip: bertahun kemudian masih
	 * bisa dijawab "versi ini dulu disusun dari berkas apa" — dan karena
	 * {@link BuktiDukungRef} ikut menyimpan namanya, jawaban itu tetap terbaca
	 * walau berkasnya sendiri sudah dihapus.
	 */
	buktiDukung: z.array(buktiDukungRefSchema),
	/**
	 * Id chunk vector database yang jadi rujukan saat AI menyusun isinya. Kosong
	 * untuk checkpoint `MANUAL`. Belum ditampilkan di mana pun — tab Rujukan
	 * (§11.1) yang akan membacanya.
	 */
	referensiChunkIds: z.array(z.string()),
	/**
	 * Salinan permanen mutu jawaban AI milik isi yang di-snapshot. `null` bila isi
	 * itu tidak lahir dari generate.
	 *
	 * Ikut ke sini **bukan** karena `sumber === 'AI'`, melainkan karena isinya
	 * memang pernah dinilai: checkpoint manual dari tulisan yang tadinya digenerate
	 * mewarisi skor itu secara sah, dan checkpoint dari tulisan tangan otomatis
	 * `null` tanpa perlu aturan tambahan.
	 *
	 * Berbeda dari yang di bab, salinan ini **tidak pernah basi** — `kontenSnapshot`
	 * memang tidak bisa berubah.
	 */
	ragas: ragasScoreSchema.nullable().default(null),
	dibuatOlehUserId: z.string(),
	/**
	 * Nama pembuat ikut disimpan, bukan di-lookup ke `userRepository` saat render.
	 * Ini arsip: namanya harus tetap terbaca walau user-nya sudah dihapus.
	 * Preseden yang sama dipakai `EvidenceEntity.uploadedByName`.
	 */
	dibuatOlehNama: z.string(),
	/** ISO. */
	dibuatPada: z.string(),
});

export type ChapterDraftEntity = z.infer<typeof chapterDraftSchema>;

/**
 * Judul yang tampil di daftar riwayat. `label` memang opsional (§8.1), jadi
 * nomor versinya yang jadi penanda cadangan — checkpoint tanpa nama tetap harus
 * bisa dibedakan satu sama lain.
 */
export function labelDraft(draft: ChapterDraftEntity): string {
	return draft.label ?? `Versi ${draft.versi}`;
}
