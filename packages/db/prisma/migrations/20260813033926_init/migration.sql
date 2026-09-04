-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PIMPINAN', 'PENJAMIN_MUTU', 'PENYUSUN');

-- CreateEnum
CREATE TYPE "Jenjang" AS ENUM ('D3', 'D4', 'S1', 'S2', 'S3');

-- CreateEnum
CREATE TYPE "PeringkatAkreditasi" AS ENUM ('UNGGUL', 'BAIK_SEKALI', 'BAIK', 'BELUM_TERAKREDITASI');

-- CreateEnum
CREATE TYPE "StatusDokumen" AS ENUM ('DRAFT', 'REVIEW', 'SELESAI');

-- CreateEnum
CREATE TYPE "SumberDraft" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "OwnerTipe" AS ENUM ('TENANT', 'PROGRAM_STUDI');

-- CreateEnum
CREATE TYPE "StatusEkstraksi" AS ENUM ('MENUNGGU', 'DIPROSES', 'SIAP', 'GAGAL');

-- CreateEnum
CREATE TYPE "TargetTipe" AS ENUM ('BAB_AKTIF', 'BAB_DRAFT');

-- CreateEnum
CREATE TYPE "TipePanduan" AS ENUM ('PANDUAN_LAM', 'TEMPLATE_LKPS', 'DOKUMEN_RUBRIK');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('GENERASI_BAB', 'ASSESSMENT_AMI', 'INGESTION_BUKTI_DUKUNG');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "tenant" (
    "id" TEXT NOT NULL,
    "nama_universitas" TEXT NOT NULL,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "program_studi_id" TEXT,
    "nama_lengkap" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "dibuat_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_studi" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "jenjang" "Jenjang" NOT NULL,
    "fakultas" TEXT NOT NULL,
    "ketua_prodi" TEXT NOT NULL,
    "peringkat_akreditasi" "PeringkatAkreditasi" NOT NULL,
    "nomor_sk_akreditasi" TEXT,
    "berlaku_sampai_akreditasi" DATE,
    "dibuat_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_studi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dokumen_led" (
    "id" TEXT NOT NULL,
    "program_studi_id" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "tahun_akademik" TEXT NOT NULL,
    "status_keseluruhan" "StatusDokumen" NOT NULL,
    "tenggat" DATE,
    "dibuat_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dokumen_led_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bab_dokumen" (
    "id" TEXT NOT NULL,
    "dokumen_id" TEXT NOT NULL,
    "urutan_bab" INTEGER NOT NULL,
    "judul_bab" TEXT NOT NULL,
    "konten_kerja" JSONB NOT NULL,
    "checkpoint_aktif_id" TEXT,
    "terkunci" BOOLEAN NOT NULL DEFAULT false,
    "catatan_penjamin_mutu" TEXT,
    "catatan_oleh_nama" TEXT,
    "catatan_pada" TIMESTAMP(3),
    "diajukan_review_pada" TIMESTAMP(3),
    "terakhir_disimpan" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bab_dokumen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bab_draft" (
    "id" TEXT NOT NULL,
    "bab_id" TEXT NOT NULL,
    "dibuat_oleh_user_id" TEXT NOT NULL,
    "versi" INTEGER NOT NULL,
    "label" TEXT,
    "konten_snapshot" JSONB NOT NULL,
    "sumber" "SumberDraft" NOT NULL,
    "referensi_chunk_ids" TEXT,
    "dibuat_oleh_nama" TEXT NOT NULL,
    "dibuat_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bab_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bukti_dukung" (
    "id" TEXT NOT NULL,
    "owner_tipe" "OwnerTipe" NOT NULL,
    "tenant_id" TEXT,
    "program_studi_id" TEXT,
    "nama_dokumen" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "tipe_file" TEXT NOT NULL,
    "ukuran_bytes" INTEGER NOT NULL,
    "status_ekstraksi" "StatusEkstraksi" NOT NULL,
    "catatan_gagal" TEXT,
    "diunggah_oleh_user_id" TEXT NOT NULL,
    "diunggah_oleh_nama" TEXT NOT NULL,
    "waktu_diunggah" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bukti_dukung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bukti_dukung_bab" (
    "id" TEXT NOT NULL,
    "bukti_dukung_id" TEXT NOT NULL,
    "bab_dokumen_id" TEXT NOT NULL,
    "nama_dokumen" TEXT NOT NULL,
    "tipe_file" TEXT NOT NULL,

    CONSTRAINT "bukti_dukung_bab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bukti_dukung_draft" (
    "id" TEXT NOT NULL,
    "bukti_dukung_id" TEXT NOT NULL,
    "bab_draft_id" TEXT NOT NULL,
    "nama_dokumen" TEXT NOT NULL,
    "tipe_file" TEXT NOT NULL,

    CONSTRAINT "bukti_dukung_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubrik_kriteria" (
    "id" TEXT NOT NULL,
    "kode_kriteria" TEXT NOT NULL,
    "deskripsi" TEXT NOT NULL,

    CONSTRAINT "rubrik_kriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubrik_level" (
    "id" TEXT NOT NULL,
    "kriteria_id" TEXT NOT NULL,
    "skor" INTEGER NOT NULL,
    "deskripsi" TEXT NOT NULL,

    CONSTRAINT "rubrik_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubrik_kriteria_bab" (
    "id" TEXT NOT NULL,
    "kriteria_id" TEXT NOT NULL,
    "urutan_bab" INTEGER NOT NULL,

    CONSTRAINT "rubrik_kriteria_bab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hasil_skor_kriteria" (
    "id" TEXT NOT NULL,
    "kriteria_id" TEXT NOT NULL,
    "target_tipe" "TargetTipe" NOT NULL,
    "bab_id" TEXT,
    "bab_draft_id" TEXT,
    "skor_didapat" INTEGER NOT NULL,
    "justifikasi" TEXT,
    "dijalankan_oleh_user_id" TEXT NOT NULL,
    "dijalankan_oleh_nama" TEXT NOT NULL,
    "dijalankan_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hasil_skor_kriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panduan_referensi" (
    "id" TEXT NOT NULL,
    "tipe" "TipePanduan" NOT NULL,
    "judul" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "tipe_file" TEXT NOT NULL,
    "dibuat_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "panduan_referensi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panduan_detail" (
    "id" TEXT NOT NULL,
    "panduan_id" TEXT NOT NULL,
    "kode_poin" TEXT NOT NULL,
    "judul_poin" TEXT NOT NULL,
    "isi_teks" TEXT NOT NULL,

    CONSTRAINT "panduan_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panduan_detail_bab" (
    "id" TEXT NOT NULL,
    "panduan_detail_id" TEXT NOT NULL,
    "urutan_bab" INTEGER NOT NULL,

    CONSTRAINT "panduan_detail_bab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_runs" (
    "id" TEXT NOT NULL,
    "bab_draft_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "pedoman_used" JSONB NOT NULL,
    "rubric_used" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "chunks_used" JSONB NOT NULL,
    "judge_result" JSONB,
    "prompt_full" TEXT NOT NULL,
    "latency_sec" DOUBLE PRECISION NOT NULL,
    "token_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ragas_scores" (
    "id" TEXT NOT NULL,
    "target_tipe" "TargetTipe" NOT NULL,
    "bab_id" TEXT,
    "bab_draft_id" TEXT,
    "metrik" JSONB NOT NULL,
    "jumlah_chunk" INTEGER NOT NULL,
    "dihitung_pada" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ragas_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "bab_dokumen_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "queue_name" TEXT NOT NULL,
    "bull_job_id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'WAITING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dokumen_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "laporan_bukti_dukung_id" TEXT,
    "total_indicators" INTEGER NOT NULL,
    "completed_indicators" INTEGER NOT NULL DEFAULT 0,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicator_results" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "indicator_no" INTEGER NOT NULL,
    "score" DECIMAL(5,2),
    "justification" TEXT,
    "confidence" DECIMAL(4,3),
    "recommendation" TEXT,
    "model" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indicator_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasoning_steps" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "indicator_no" INTEGER NOT NULL,
    "step_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reasoning_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_results" (
    "id" TEXT NOT NULL,
    "generation_run_id" TEXT NOT NULL,
    "rouge_1" DOUBLE PRECISION,
    "rouge_2" DOUBLE PRECISION,
    "rouge_l" DOUBLE PRECISION,
    "bleu_4" DOUBLE PRECISION,
    "answer_relevancy" DOUBLE PRECISION,
    "context_precision" DOUBLE PRECISION,
    "context_recall" DOUBLE PRECISION,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_tenant_id_idx" ON "user"("tenant_id");

-- CreateIndex
CREATE INDEX "program_studi_tenant_id_idx" ON "program_studi"("tenant_id");

-- CreateIndex
CREATE INDEX "dokumen_led_program_studi_id_idx" ON "dokumen_led"("program_studi_id");

-- CreateIndex
CREATE UNIQUE INDEX "bab_dokumen_dokumen_id_urutan_bab_key" ON "bab_dokumen"("dokumen_id", "urutan_bab");

-- CreateIndex
CREATE INDEX "bab_draft_bab_id_idx" ON "bab_draft"("bab_id");

-- CreateIndex
CREATE UNIQUE INDEX "bab_draft_bab_id_versi_key" ON "bab_draft"("bab_id", "versi");

-- CreateIndex
CREATE INDEX "bukti_dukung_tenant_id_idx" ON "bukti_dukung"("tenant_id");

-- CreateIndex
CREATE INDEX "bukti_dukung_program_studi_id_idx" ON "bukti_dukung"("program_studi_id");

-- CreateIndex
CREATE UNIQUE INDEX "bukti_dukung_bab_bukti_dukung_id_bab_dokumen_id_key" ON "bukti_dukung_bab"("bukti_dukung_id", "bab_dokumen_id");

-- CreateIndex
CREATE UNIQUE INDEX "bukti_dukung_draft_bukti_dukung_id_bab_draft_id_key" ON "bukti_dukung_draft"("bukti_dukung_id", "bab_draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "rubrik_level_kriteria_id_skor_key" ON "rubrik_level"("kriteria_id", "skor");

-- CreateIndex
CREATE UNIQUE INDEX "rubrik_kriteria_bab_kriteria_id_urutan_bab_key" ON "rubrik_kriteria_bab"("kriteria_id", "urutan_bab");

-- CreateIndex
CREATE INDEX "hasil_skor_kriteria_bab_id_idx" ON "hasil_skor_kriteria"("bab_id");

-- CreateIndex
CREATE INDEX "hasil_skor_kriteria_bab_draft_id_idx" ON "hasil_skor_kriteria"("bab_draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "generation_runs_bab_draft_id_key" ON "generation_runs"("bab_draft_id");

-- CreateIndex
CREATE INDEX "ragas_scores_bab_id_idx" ON "ragas_scores"("bab_id");

-- CreateIndex
CREATE INDEX "ragas_scores_bab_draft_id_idx" ON "ragas_scores"("bab_draft_id");

-- CreateIndex
CREATE INDEX "chat_messages_bab_dokumen_id_idx" ON "chat_messages"("bab_dokumen_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_bull_job_id_key" ON "jobs"("bull_job_id");

-- CreateIndex
CREATE INDEX "jobs_tenant_id_status_idx" ON "jobs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "assessment_sessions_tenant_id_status_idx" ON "assessment_sessions"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "indicator_results_session_id_indicator_no_key" ON "indicator_results"("session_id", "indicator_no");

-- CreateIndex
CREATE INDEX "reasoning_steps_session_id_indicator_no_idx" ON "reasoning_steps"("session_id", "indicator_no");

-- CreateIndex
CREATE UNIQUE INDEX "eval_results_generation_run_id_key" ON "eval_results"("generation_run_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_program_studi_id_fkey" FOREIGN KEY ("program_studi_id") REFERENCES "program_studi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_studi" ADD CONSTRAINT "program_studi_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumen_led" ADD CONSTRAINT "dokumen_led_program_studi_id_fkey" FOREIGN KEY ("program_studi_id") REFERENCES "program_studi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bab_dokumen" ADD CONSTRAINT "bab_dokumen_dokumen_id_fkey" FOREIGN KEY ("dokumen_id") REFERENCES "dokumen_led"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bab_dokumen" ADD CONSTRAINT "bab_dokumen_checkpoint_aktif_id_fkey" FOREIGN KEY ("checkpoint_aktif_id") REFERENCES "bab_draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bab_draft" ADD CONSTRAINT "bab_draft_bab_id_fkey" FOREIGN KEY ("bab_id") REFERENCES "bab_dokumen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bab_draft" ADD CONSTRAINT "bab_draft_dibuat_oleh_user_id_fkey" FOREIGN KEY ("dibuat_oleh_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_dukung" ADD CONSTRAINT "bukti_dukung_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_dukung" ADD CONSTRAINT "bukti_dukung_program_studi_id_fkey" FOREIGN KEY ("program_studi_id") REFERENCES "program_studi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_dukung" ADD CONSTRAINT "bukti_dukung_diunggah_oleh_user_id_fkey" FOREIGN KEY ("diunggah_oleh_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_dukung_bab" ADD CONSTRAINT "bukti_dukung_bab_bukti_dukung_id_fkey" FOREIGN KEY ("bukti_dukung_id") REFERENCES "bukti_dukung"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_dukung_bab" ADD CONSTRAINT "bukti_dukung_bab_bab_dokumen_id_fkey" FOREIGN KEY ("bab_dokumen_id") REFERENCES "bab_dokumen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_dukung_draft" ADD CONSTRAINT "bukti_dukung_draft_bukti_dukung_id_fkey" FOREIGN KEY ("bukti_dukung_id") REFERENCES "bukti_dukung"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_dukung_draft" ADD CONSTRAINT "bukti_dukung_draft_bab_draft_id_fkey" FOREIGN KEY ("bab_draft_id") REFERENCES "bab_draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubrik_level" ADD CONSTRAINT "rubrik_level_kriteria_id_fkey" FOREIGN KEY ("kriteria_id") REFERENCES "rubrik_kriteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubrik_kriteria_bab" ADD CONSTRAINT "rubrik_kriteria_bab_kriteria_id_fkey" FOREIGN KEY ("kriteria_id") REFERENCES "rubrik_kriteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hasil_skor_kriteria" ADD CONSTRAINT "hasil_skor_kriteria_kriteria_id_fkey" FOREIGN KEY ("kriteria_id") REFERENCES "rubrik_kriteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hasil_skor_kriteria" ADD CONSTRAINT "hasil_skor_kriteria_bab_id_fkey" FOREIGN KEY ("bab_id") REFERENCES "bab_dokumen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hasil_skor_kriteria" ADD CONSTRAINT "hasil_skor_kriteria_bab_draft_id_fkey" FOREIGN KEY ("bab_draft_id") REFERENCES "bab_draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hasil_skor_kriteria" ADD CONSTRAINT "hasil_skor_kriteria_dijalankan_oleh_user_id_fkey" FOREIGN KEY ("dijalankan_oleh_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panduan_detail" ADD CONSTRAINT "panduan_detail_panduan_id_fkey" FOREIGN KEY ("panduan_id") REFERENCES "panduan_referensi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panduan_detail_bab" ADD CONSTRAINT "panduan_detail_bab_panduan_detail_id_fkey" FOREIGN KEY ("panduan_detail_id") REFERENCES "panduan_detail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_bab_draft_id_fkey" FOREIGN KEY ("bab_draft_id") REFERENCES "bab_draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ragas_scores" ADD CONSTRAINT "ragas_scores_bab_id_fkey" FOREIGN KEY ("bab_id") REFERENCES "bab_dokumen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ragas_scores" ADD CONSTRAINT "ragas_scores_bab_draft_id_fkey" FOREIGN KEY ("bab_draft_id") REFERENCES "bab_draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_bab_dokumen_id_fkey" FOREIGN KEY ("bab_dokumen_id") REFERENCES "bab_dokumen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_dokumen_id_fkey" FOREIGN KEY ("dokumen_id") REFERENCES "dokumen_led"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_laporan_bukti_dukung_id_fkey" FOREIGN KEY ("laporan_bukti_dukung_id") REFERENCES "bukti_dukung"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicator_results" ADD CONSTRAINT "indicator_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "assessment_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasoning_steps" ADD CONSTRAINT "reasoning_steps_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "assessment_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
