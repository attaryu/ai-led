import { AssessmentService } from './assessment.service';
import type { PrismaService } from '../database/prisma.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import type { DokumenLedService } from '../dokumen-led/dokumen-led.service';

function makeResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r1',
    sessionId: 's1',
    indicatorNo: 1,
    score: '3.5',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeService() {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma: Pick<PrismaService, 'indicatorResult'> = {
    indicatorResult: { findMany } as never,
  };
  const tenantContext: Pick<TenantContextService, 'getOrThrow'> = {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 't1', userId: 'u1' }),
  };
  const dokumenLedService: Pick<DokumenLedService, 'findOne'> = {
    findOne: jest.fn().mockResolvedValue({ id: 'd1' }),
  };
  const service = new AssessmentService(
    prisma as PrismaService,
    tenantContext as TenantContextService,
    dokumenLedService as DokumenLedService,
  );
  return { service, findMany, dokumenLedService };
}

describe('AssessmentService.findResultsForDocument', () => {
  it('keeps only the newest result per indicator across every session of the document', async () => {
    const { service, findMany } = makeService();
    // findMany is queried orderBy createdAt desc — newest first, per indicator 1 twice
    // (an older run and a newer re-run) plus one indicator only assessed once.
    findMany.mockResolvedValue([
      makeResult({ id: 'newest-1', indicatorNo: 1, score: '4.0', createdAt: new Date('2026-01-02') }),
      makeResult({ id: 'older-1', indicatorNo: 1, score: '3.0', createdAt: new Date('2026-01-01') }),
      makeResult({ id: 'only-2', indicatorNo: 2, score: '2.0', createdAt: new Date('2026-01-01') }),
    ]);

    const result = await service.findResultsForDocument('d1');

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.indicatorNo === 1)?.id).toBe('newest-1');
    expect(result.find((r) => r.indicatorNo === 2)?.id).toBe('only-2');
  });

  it('scopes the query to the document via session relation, tenant-isolated through DokumenLedService.findOne', async () => {
    const { service, findMany, dokumenLedService } = makeService();

    await service.findResultsForDocument('d1');

    expect(dokumenLedService.findOne).toHaveBeenCalledWith('d1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { session: { documentId: 'd1' } } }),
    );
  });

  it('sorts the merged results by indicator number', async () => {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([
      makeResult({ id: 'r5', indicatorNo: 5 }),
      makeResult({ id: 'r1', indicatorNo: 1 }),
      makeResult({ id: 'r3', indicatorNo: 3 }),
    ]);

    const result = await service.findResultsForDocument('d1');

    expect(result.map((r) => r.indicatorNo)).toEqual([1, 3, 5]);
  });
});
