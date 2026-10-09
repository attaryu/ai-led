-- Job baru: penilaian kualitas RAGAS atas satu section, dipicu pengguna lewat tombol
-- (bukan otomatis setelah generate). Berjalan di antrean generation-queue.
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'PENILAIAN_RAGAS';
