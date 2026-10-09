-- Tahun / periode untuk LKPS. Satu program studi boleh punya beberapa LKPS (mis. per
-- tahun akademik), dan tiap Dokumen LED memilih salah satunya -- tanpa penanda
-- periode, pilihan itu hanya dibedakan lewat nama berkas.
--
-- Teks bebas (mis. "2024/2025", "TS 2024"), nullable: Bukti Dukung tidak memakainya,
-- dan LKPS yang diunggah sebelum kolom ini ada tetap valid dengan period = NULL.
-- Wajib untuk LKPS BARU ditegakkan di BuktiDukungService.create, bukan di sini.

ALTER TABLE "evidence_files" ADD COLUMN "period" TEXT;
