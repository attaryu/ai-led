import { ConflictException } from '@nestjs/common';
import { JobType, Role } from '@ai-led/db';
import { DokumenLedService } from './dokumen-led.service';
import type { JobsService } from '../jobs/jobs.service';
import type { TenantContextService } from '../tenant/tenant-context.service';

function makeService(context: {
  tenantId: string;
  role: Role;
  studyProgramId: string | null;
}) {
  const findMany = jest.fn().mockResolvedValue([]);
  const findFirst = jest.fn().mockResolvedValue(null);
  const count = jest.fn().mockResolvedValue(0);
  const deleteOne = jest.fn().mockResolvedValue(undefined);
  const deleteManyVerdict = jest.fn().mockResolvedValue({ count: 0 });
  const deleteManySession = jest.fn().mockResolvedValue({ count: 0 });
  const deleteManyChunk = jest.fn().mockResolvedValue({ count: 0 });
  const transaction = jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  const prisma = {
    ledDocument: { findMany, findFirst, delete: deleteOne },
    documentChapter: { count },
    assessmentVerdict: { deleteMany: deleteManyVerdict },
    assessmentSession: { deleteMany: deleteManySession },
    ledChunkEmbedding: { deleteMany: deleteManyChunk },
    $transaction: transaction,
  };
  const tenantContext: Pick<TenantContextService, 'getOrThrow'> = {
    getOrThrow: jest.fn().mockReturnValue({ userId: 'u1', ...context }),
  };
  const jobsService: Pick<JobsService, 'enqueue'> = {
    enqueue: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };
  const service = new DokumenLedService(
    prisma as never,
    tenantContext as TenantContextService,
    jobsService as JobsService,
  );
  return {
    service,
    findMany,
    findFirst,
    count,
    deleteOne,
    deleteManyVerdict,
    deleteManySession,
    deleteManyChunk,
    transaction,
    jobsService,
  };
}

describe('DokumenLedService.findAllForTenant', () => {
  it('returns an empty list for a PENYUSUN with no assigned prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PENYUSUN,
      studyProgramId: null,
    });

    await expect(service.findAllForTenant()).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('scopes a PENYUSUN to their own prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PENYUSUN,
      studyProgramId: 'prodi-1',
    });

    await service.findAllForTenant();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studyProgram: { tenantId: 't1' },
          studyProgramId: 'prodi-1',
        }) as unknown,
      }),
    );
  });

  it('does not scope PIMPINAN/PENJAMIN_MUTU/ADMIN to any single prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PIMPINAN,
      studyProgramId: null,
    });

    await service.findAllForTenant();
    const call = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('studyProgramId');
  });
});

describe('DokumenLedService.triggerAssessment', () => {
  it('enqueues an ASSESSMENT_AMI job with correct payload when document exists', async () => {
    const { service, findFirst, jobsService } = makeService({
      tenantId: 't1',
      role: Role.PENJAMIN_MUTU,
      studyProgramId: null,
    });

    findFirst.mockResolvedValue({
      id: 'doc-123',
      studyProgramId: 'prodi-1',
    });

    const res = await service.triggerAssessment('doc-123', {
      indikatorList: [1, 2],
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-123', studyProgram: { tenantId: 't1' } },
    });
    expect(jobsService.enqueue).toHaveBeenCalledWith(JobType.ASSESSMENT_AMI, {
      dokumenId: 'doc-123',
      tenantId: 't1',
      // BullMQ job payload key stays `programStudiId` — cross-service contract
      // with apps/ai's worker, not renamed alongside the Prisma field.
      programStudiId: 'prodi-1',
      createdByUserId: 'u1',
      indikatorList: [1, 2],
    });
    expect(res).toEqual({ id: 'job-1' });
  });

  it('omits indikatorList (not []) when unspecified, so it reads as "assess all" downstream', async () => {
    const { service, findFirst, jobsService } = makeService({
      tenantId: 't1',
      role: Role.PENJAMIN_MUTU,
      studyProgramId: null,
    });

    findFirst.mockResolvedValue({ id: 'doc-123', studyProgramId: 'prodi-1' });

    await service.triggerAssessment('doc-123');

    const payload = (jobsService.enqueue as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.indikatorList).toBeUndefined();
  });

  it('throws NotFoundException if document does not exist for tenant', async () => {
    const { service, findFirst } = makeService({
      tenantId: 't1',
      role: Role.PENJAMIN_MUTU,
      studyProgramId: null,
    });

    findFirst.mockResolvedValue(null);

    await expect(
      service.triggerAssessment('invalid-id'),
    ).rejects.toThrow('Dokumen LED tidak ditemukan');
  });
});

describe('DokumenLedService.remove', () => {
  it('rejects while the document still has chapters, without touching assessment/chunk tables', async () => {
    const { service, findFirst, count, transaction } = makeService({
      tenantId: 't1',
      role: Role.PENJAMIN_MUTU,
      studyProgramId: null,
    });
    findFirst.mockResolvedValue({ id: 'doc-123', studyProgramId: 'prodi-1' });
    count.mockResolvedValue(2);

    await expect(service.remove('doc-123')).rejects.toThrow(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('cascades assessment sessions/verdicts and LED chunk embeddings once chapters are gone', async () => {
    const { service, findFirst, count, deleteManyVerdict, deleteManySession, deleteManyChunk, deleteOne, transaction } =
      makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    findFirst.mockResolvedValue({ id: 'doc-123', studyProgramId: 'prodi-1' });
    count.mockResolvedValue(0);

    await service.remove('doc-123');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteManyVerdict).toHaveBeenCalledWith({ where: { documentId: 'doc-123' } });
    expect(deleteManySession).toHaveBeenCalledWith({ where: { documentId: 'doc-123' } });
    expect(deleteManyChunk).toHaveBeenCalledWith({ where: { documentId: 'doc-123' } });
    expect(deleteOne).toHaveBeenCalledWith({ where: { id: 'doc-123' } });
  });
});
