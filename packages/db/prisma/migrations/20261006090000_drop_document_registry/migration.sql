-- Hapus document_registry: indeks folder-level (1 vektor per folder, dibuat dari
-- nama folder) milik tahap route_and_plan yang sudah dibuang.
--
-- Rekomendasi dokumen dulu bekerja dua tahap: LLM menyusun document_query teks
-- bebas, lalu search_document_registry mencari folder kandidat secara semantik.
-- Keduanya diganti pemilihan langsung dari document_catalog.DOCUMENT_CATALOG
-- (closed set) -- lihat komentar di apps/ai/worker.py::_handle_rekomendasi_dokumen.
-- Alasannya: tenant yang belum mengunggah apa pun mendapat nol kandidat.
--
-- Saat dihapus: 0 baris, tidak ada penulis maupun pembaca
-- (vectorstore/document_registry_store.py sudah tidak ada di repo).
-- Catatan: ini BUKAN evidence_chunk_embeddings, yang masih aktif dipakai
-- cross-check AMI (indeks tingkat isi dokumen, bukan tingkat folder).

DROP TABLE IF EXISTS "document_registry";
