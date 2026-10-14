import { JobType } from '@ai-led/db';
import { Redis } from 'ioredis';
import { JobsService } from './jobs.service';

// JobsService membuat koneksi Redis di field initializer; di tes cukup double yang mencatat panggilan.
jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('../config/env', () => ({ requireEnv: () => 'redis://test' }));

type FakeBullJob = {
  getState: jest.Mock;
  remove: jest.Mock;
  progress?: unknown;
  returnvalue?: unknown;
  failedReason?: string;
};

function bullJob(state: string, extra: Partial<FakeBullJob> = {}): FakeBullJob {
  return { getState: jest.fn().mockResolvedValue(state), remove: jest.fn(), ...extra };
}

function makeService() {
  const queue = () => ({ getJob: jest.fn().mockResolvedValue(undefined), add: jest.fn() });
  const generationQueue = queue();
  const assessmentQueue = queue();
  const ingestionQueue = queue();
  const findFirst = jest.fn();
  const prisma = { job: { findFirst, create: jest.fn() } };
  const tenantContext = { getOrThrow: jest.fn().mockReturnValue({ tenantId: 't1', userId: 'u1' }) };

  const service = new JobsService(
    generationQueue as never,
    assessmentQueue as never,
    ingestionQueue as never,
    prisma as never,
    tenantContext as never,
  );
  const redis = (Redis as unknown as jest.Mock).mock.results.at(-1)!.value as { set: jest.Mock };
  return { service, findFirst, generationQueue, assessmentQueue, ingestionQueue, redis };
}

const rowSetorLed = {
  id: 'job-cuid',
  tenantId: 't1',
  type: JobType.SETOR_LED,
  queueName: 'assessment-queue',
  bullJobId: '12',
  status: 'WAITING',
  progress: 0,
  result: null,
  error: null,
};

describe('JobsService.cancel — SETOR_LED', () => {
  it('matches a SETOR_LED job by its BullMQ id (what the SSE stream exposes), not only AMI', async () => {
    const m = makeService();
    m.findFirst.mockResolvedValue(rowSetorLed);
    m.assessmentQueue.getJob.mockResolvedValue(bullJob('active'));

    await m.service.cancel('12');

    const where = m.findFirst.mock.calls[0][0].where as { tenantId: string; OR: unknown[] };
    expect(where.tenantId).toBe('t1');
    expect(where.OR).toContainEqual({
      bullJobId: '12',
      type: { in: [JobType.ASSESSMENT_AMI, JobType.SETOR_LED] },
    });
    expect(m.redis.set).toHaveBeenCalledWith('job:cancel:12', '1', 'EX', 3600);
  });

  it('removes a still-waiting job from the queue before flagging it', async () => {
    const m = makeService();
    m.findFirst.mockResolvedValue(rowSetorLed);
    const waiting = bullJob('waiting');
    m.assessmentQueue.getJob.mockResolvedValue(waiting);

    await m.service.cancel('job-cuid');

    expect(waiting.remove).toHaveBeenCalled();
  });

  it('404s when the job is not in this tenant', async () => {
    const m = makeService();
    m.findFirst.mockResolvedValue(null);
    await expect(m.service.cancel('nope')).rejects.toThrow('Job not found');
    expect(m.redis.set).not.toHaveBeenCalled();
  });
});

describe('JobsService.getJob', () => {
  it('returns the finished result from BullMQ even though the Postgres row never saw it', async () => {
    const m = makeService();
    m.findFirst.mockResolvedValue(rowSetorLed); // baris DB tetap WAITING/null: tidak ada yang menulisnya
    const hasil = { status: 'completed', hasil: [{ kode: 'IKU.A', evaluasi: 'MEMENUHI' }] };
    m.assessmentQueue.getJob.mockResolvedValue(bullJob('completed', { progress: 100, returnvalue: hasil }));

    const view = await m.service.getJob('job-cuid');

    expect(m.findFirst).toHaveBeenCalledWith({ where: { id: 'job-cuid', tenantId: 't1' } });
    expect(m.assessmentQueue.getJob).toHaveBeenCalledWith('12');
    expect(view).toEqual({
      id: 'job-cuid',
      type: JobType.SETOR_LED,
      status: 'COMPLETED',
      progress: 100,
      result: hasil,
      error: null,
    });
  });

  it('reports live progress while the job is active, with no result yet', async () => {
    const m = makeService();
    m.findFirst.mockResolvedValue(rowSetorLed);
    m.assessmentQueue.getJob.mockResolvedValue(bullJob('active', { progress: { completed: 1, total: 3 } }));

    const view = await m.service.getJob('job-cuid');

    expect(view.status).toBe('ACTIVE');
    expect(view.progress).toEqual({ completed: 1, total: 3 });
    expect(view.result).toBeNull();
  });

  it('reports the failure reason of a failed job', async () => {
    const m = makeService();
    m.findFirst.mockResolvedValue(rowSetorLed);
    m.assessmentQueue.getJob.mockResolvedValue(bullJob('failed', { failedReason: 'Ollama down' }));

    const view = await m.service.getJob('job-cuid');

    expect(view.status).toBe('FAILED');
    expect(view.error).toBe('Ollama down');
  });

  it.each(['waiting', 'delayed', 'prioritized', 'waiting-children'])('maps BullMQ state %s to WAITING', async (state) => {
    const m = makeService();
    m.findFirst.mockResolvedValue(rowSetorLed);
    m.assessmentQueue.getJob.mockResolvedValue(bullJob(state));
    expect((await m.service.getJob('job-cuid')).status).toBe('WAITING');
  });

  it('falls back to the Postgres row when BullMQ already evicted the job', async () => {
    const m = makeService();
    m.findFirst.mockResolvedValue({
      ...rowSetorLed,
      status: 'COMPLETED',
      progress: 100,
      result: { status: 'completed', hasil: [] },
    });
    m.assessmentQueue.getJob.mockResolvedValue(undefined);

    const view = await m.service.getJob('job-cuid');

    expect(view).toEqual({
      id: 'job-cuid',
      type: JobType.SETOR_LED,
      status: 'COMPLETED',
      progress: 100,
      result: { status: 'completed', hasil: [] },
      error: null,
    });
  });

  it('looks the job up in the queue that its type belongs to', async () => {
    const m = makeService();
    m.findFirst.mockResolvedValue({ ...rowSetorLed, type: JobType.INGESTION_LED, queueName: 'ingestion-queue' });
    await m.service.getJob('job-cuid');
    expect(m.ingestionQueue.getJob).toHaveBeenCalledWith('12');
    expect(m.assessmentQueue.getJob).not.toHaveBeenCalled();
  });

  it('404s for a job of another tenant without touching any queue', async () => {
    const m = makeService();
    m.findFirst.mockResolvedValue(null);

    await expect(m.service.getJob('punya-tenant-lain')).rejects.toThrow('Job not found');
    expect(m.assessmentQueue.getJob).not.toHaveBeenCalled();
    expect(m.generationQueue.getJob).not.toHaveBeenCalled();
    expect(m.ingestionQueue.getJob).not.toHaveBeenCalled();
  });
});
