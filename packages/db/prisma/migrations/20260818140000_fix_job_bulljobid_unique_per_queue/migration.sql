-- BullMQ numbers jobs per-queue (each queue has its own counter), not
-- globally -- the first job in generation-queue and the first job in
-- assessment-queue both get bull_job_id "1". A bare UNIQUE on bull_job_id
-- collides the moment more than one queue is actually used, which is why
-- POST /jobs started throwing P2002 on the 2nd/3rd queue during live testing
-- (tracker "Rencana Integrasi" row: worker consumer verification, 18 Agustus
-- 2026). The real uniqueness is the pair (queue_name, bull_job_id).

-- DropIndex
DROP INDEX "jobs_bull_job_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "jobs_queue_name_bull_job_id_key" ON "jobs"("queue_name", "bull_job_id");
