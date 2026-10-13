-- Job baru: "setor ke LED" -- mengisi tabel analisis IKU (C5.1, C6.1, ...) dengan kategori
-- Evaluasi + narasi, terpisah dari ASSESSMENT_AMI. Berjalan di antrean assessment-queue.
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'SETOR_LED';
