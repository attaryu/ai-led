import { z } from 'zod';

/**
 * Rujukan ke satu bukti dukung yang dipakai sebuah bab atau checkpoint
 * (docs/database.md → `BUKTI_DUKUNG_BAB` dan `BUKTI_DUKUNG_DRAFT`).
 *
 * Berkas sendiri, bukan dititipkan ke salah satu entitas, karena `ChapterEntity`
 * dan `ChapterDraftEntity` sama-sama memakainya dan tidak ada yang memilikinya.
 *
 * **Kenapa menyimpan nama, bukan hanya id.** Bukti dukung bisa dihapus dari
 * Perpustakaan — dialog konfirmasinya sendiri memperingatkan bahwa bab yang
 * memakainya akan kehilangan rujukan, dan docs/application_flow.md §16
 * mencatatnya sebagai Pertanyaan Terbuka #7. Kalau yang tersimpan cuma id,
 * rujukan yang berkasnya hilang berhenti bisa dibaca sama sekali: tidak ada
 * tempat lain di sistem yang masih tahu namanya. Padahal rujukan adalah arsip —
 * gunanya justru menjawab "bab ini dulu disusun dari berkas apa" bertahun
 * kemudian, saat diperiksa asesor. Preseden yang sama sudah dipakai
 * `ChapterDraftEntity.dibuatOlehNama` dan `EvidenceEntity.uploadedByName`.
 *
 * **Kenapa berhenti di nama dan tipe.** `ukuranBytes` dan `status` sengaja tidak
 * ikut: keduanya berubah sepanjang umur berkas — status bahkan bisa mundur saat
 * ingestion diulang — sehingga menyalinnya berarti mengarsipkan keadaan yang
 * langsung basi. Yang diarsipkan di sini identitas berkasnya; keadaan terkini
 * dibaca langsung dari Perpustakaan saat ditampilkan.
 */
export const buktiDukungRefSchema = z.object({
	id: z.string(),
	/** Nama saat rujukan dibuat; bertahan walau berkasnya kemudian dihapus. */
	namaDokumen: z.string(),
	/** Ekstensi huruf kecil (`pdf`, `xlsx`, …), untuk ikon dan keterangan arsip. */
	tipeFile: z.string(),
});

export type BuktiDukungRef = z.infer<typeof buktiDukungRefSchema>;
