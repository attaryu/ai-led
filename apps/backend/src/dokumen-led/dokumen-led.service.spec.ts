import { JobType, Role } from '@ai-led/db';
import { DokumenLedService } from './dokumen-led.service';
import type { JobsService } from '../jobs/jobs.service';
import type { TenantContextService } from '../tenant/tenant-context.service';

function makeService(context: {
  tenantId: string;
  role: Role;
  programStudiId: string | null;
}) {
  const findMany = jest.fn().mockResolvedValue([]);
  const findFirst = jest.fn().mockResolvedValue(null);
  const prisma = {
    dokumenLed: { findMany, findFirst },
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
  return { service, findMany, findFirst, jobsService };
}

describe('DokumenLedService.findAllForTenant', () => {
  it('returns an empty list for a PENYUSUN with no assigned prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PENYUSUN,
      programStudiId: null,
    });

    await expect(service.findAllForTenant()).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('scopes a PENYUSUN to their own prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PENYUSUN,
      programStudiId: 'prodi-1',
    });

    await service.findAllForTenant();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          programStudi: { tenantId: 't1' },
          programStudiId: 'prodi-1',
        }) as unknown,
      }),
    );
  });

  it('does not scope PIMPINAN/PENJAMIN_MUTU/ADMIN to any single prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PIMPINAN,
      programStudiId: null,
    });

    await service.findAllForTenant();
    const call = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('programStudiId');
  });
});

describe('DokumenLedService.triggerAssessment', () => {
  it('enqueues an ASSESSMENT_AMI job with correct payload when document exists', async () => {
    const { service, findFirst, jobsService } = makeService({
      tenantId: 't1',
      role: Role.PENJAMIN_MUTU,
      programStudiId: null,
    });

    findFirst.mockResolvedValue({
      id: 'doc-123',
      programStudiId: 'prodi-1',
    });

    const res = await service.triggerAssessment('doc-123', {
      indikatorList: [1, 2],
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-123', programStudi: { tenantId: 't1' } },
    });
    expect(jobsService.enqueue).toHaveBeenCalledWith(JobType.ASSESSMENT_AMI, {
      dokumenId: 'doc-123',
      tenantId: 't1',
      programStudiId: 'prodi-1',
      indikatorList: [1, 2],
    });
    expect(res).toEqual({ id: 'job-1' });
  });

  it('omits indikatorList (not []) when unspecified, so it reads as "assess all" downstream', async () => {
    const { service, findFirst, jobsService } = makeService({
      tenantId: 't1',
      role: Role.PENJAMIN_MUTU,
      programStudiId: null,
    });

    findFirst.mockResolvedValue({ id: 'doc-123', programStudiId: 'prodi-1' });

    await service.triggerAssessment('doc-123');

    const payload = (jobsService.enqueue as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.indikatorList).toBeUndefined();
  });

  it('throws NotFoundException if document does not exist for tenant', async () => {
    const { service, findFirst } = makeService({
      tenantId: 't1',
      role: Role.PENJAMIN_MUTU,
      programStudiId: null,
    });

    findFirst.mockResolvedValue(null);

    await expect(
      service.triggerAssessment('invalid-id'),
    ).rejects.toThrow('Dokumen LED tidak ditemukan');
  });
});
