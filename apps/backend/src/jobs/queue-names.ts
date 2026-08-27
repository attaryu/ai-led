import { JobType } from '@ai-led/db';

export const GENERATION_QUEUE = 'generation-queue';
export const ASSESSMENT_QUEUE = 'assessment-queue';
export const INGESTION_QUEUE = 'ingestion-queue';

export const QUEUE_NAMES = [
  GENERATION_QUEUE,
  ASSESSMENT_QUEUE,
  INGESTION_QUEUE,
] as const;

/** Satu-satunya tempat pemetaan `JobType` -> nama antrean BullMQ ditulis. */
export const QUEUE_NAME_BY_JOB_TYPE: Record<JobType, string> = {
  [JobType.GENERASI_BAB]: GENERATION_QUEUE,
  [JobType.ASSESSMENT_AMI]: ASSESSMENT_QUEUE,
  [JobType.INGESTION_BUKTI_DUKUNG]: INGESTION_QUEUE,
  // Sama-sama pekerjaan LLM atas satu bab seperti GENERASI_BAB, bukan
  // pekerjaan baru yang butuh antrean/worker terpisah.
  [JobType.SIMULASI_SKOR]: GENERATION_QUEUE,
  [JobType.REKOMENDASI_DOKUMEN]: GENERATION_QUEUE,
};
