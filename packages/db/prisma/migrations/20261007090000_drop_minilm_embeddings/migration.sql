-- Hapus kolom MiniLM: seluruh sistem kini memakai SATU model embedding (bge-m3)
-- di kolom `embedding`.
--
-- Alasannya terukur, bukan preferensi: paraphrase-multilingual-MiniLM-L12-v2
-- punya max_seq_length = 128 token (~600 karakter Indonesia, rasio 4,8
-- char/token), sedangkan chunk evidence rerata 2306 karakter. Dibuktikan dengan
-- cosine = 1.000000 antara vektor teks penuh dan vektor teks yang dipotong
-- manual di 128 token -- artinya ~70% isi chunk memang tidak pernah
-- memengaruhi vektornya. bge-m3 menampung 8192 token.
--
-- Efek samping yang disengaja: biaya embedding tiap unggahan turun separuh
-- (dulu setiap chunk di-embed dua kali, bge-m3 + MiniLM).
--
-- Sebelum migrasi ini dijalankan, 6 baris writing_led_chunk_embeddings yang
-- HANYA punya embedding_ami sudah di-embed ulang dengan bge-m3 ke kolom
-- `embedding` -- tanpa itu keenamnya jadi tidak-tercari.
--
-- Index HNSW pada kolom ini ikut terhapus bersama kolomnya.
-- Jalur AMI tetap top-k polos TANPA ambang jarak, sama seperti sebelumnya.

ALTER TABLE "evidence_chunk_embeddings" DROP COLUMN IF EXISTS "embedding_ami";
ALTER TABLE "writing_led_chunk_embeddings" DROP COLUMN IF EXISTS "embedding_ami";
