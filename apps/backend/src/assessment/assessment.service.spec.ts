import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AssessmentService } from './assessment.service';
import type { PrismaService } from '../database/prisma.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import type { DokumenLedService } from '../dokumen-led/dokumen-led.service';

function makeResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r1',
    sessionId: 's1',
    indicatorNo: 1,
    subNo: '',
    score: '3.5',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeService() {
  const findMany = jest.fn().mockResolvedValue([]);
  const assessmentSessionFindFirst = jest.fn().mockResolvedValue({ id: 'sess1' });
  const indicatorResultFindUnique = jest.fn().mockResolvedValue(null);
  const userFindUniqueOrThrow = jest.fn().mockResolvedValue({ id: 'u1', fullName: 'Budi' });
  // ponytail: findUnique -> findMany. Sejak kolom `sub_no` ada, satu indicatorNo
  // boleh punya beberapa baris (satu per sub-indikator komposit), jadi service
  // mengambil SEMUA baris indikator itu lalu memakai level tertinggi gabungan.
  // const rubricCriterionFindUnique = jest.fn().mockResolvedValue(null);
  const rubricCriterionFindMany = jest.fn().mockResolvedValue([]);
  const assessmentVerdictUpsert = jest.fn().mockResolvedValue({ id: 'v1' });
  const assessmentVerdictDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma: Pick<
    PrismaService,
    'indicatorResult' | 'assessmentSession' | 'user' | 'rubricCriterion' | 'assessmentVerdict'
  > = {
    indicatorResult: { findMany, findUnique: indicatorResultFindUnique } as never,
    assessmentSession: { findFirst: assessmentSessionFindFirst } as never,
    user: { findUniqueOrThrow: userFindUniqueOrThrow } as never,
    rubricCriterion: { findMany: rubricCriterionFindMany } as never,
    assessmentVerdict: { upsert: assessmentVerdictUpsert, deleteMany: assessmentVerdictDeleteMany } as never,
  };
  const tenantContext: Pick<TenantContextService, 'getOrThrow'> = {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 't1', userId: 'u1' }),
  };
  const dokumenLedService: Pick<DokumenLedService, 'findOne'> = {
    findOne: jest.fn().mockResolvedValue({ id: 'd1', accreditationSetId: 'set1' }),
  };
  const service = new AssessmentService(
    prisma as PrismaService,
    tenantContext as TenantContextService,
    dokumenLedService as DokumenLedService,
  );
  return {
    service,
    findMany,
    assessmentSessionFindFirst,
    dokumenLedService,
    rubricCriterionFindMany,
    assessmentVerdictUpsert,
  };
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

  it('menyimpan DUA hasil untuk satu nomor indikator yang punya sub-indikator (tidak saling menimpa)', async () => {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([
      makeResult({ id: 'r2', indicatorNo: 43, subNo: 'II', createdAt: new Date('2026-01-02') }),
      makeResult({ id: 'r1', indicatorNo: 43, subNo: 'I', createdAt: new Date('2026-01-02') }),
      // hasil lama sub I (sesi sebelumnya) kalah oleh yang terbaru
      makeResult({ id: 'r0', indicatorNo: 43, subNo: 'I', createdAt: new Date('2026-01-01') }),
    ]);

    const result = await service.findResultsForDocument('d1');

    expect(result.map((r) => `${r.indicatorNo}.${r.subNo}`)).toEqual(['43.I', '43.II']);
    expect(result.find((r) => r.subNo === 'I')?.id).toBe('r1');
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

describe('AssessmentService.upsertVerdict', () => {
  it("rejects a finalScore above the indicator's highest RubricLevel", async () => {
    const { service, rubricCriterionFindMany, assessmentVerdictUpsert } = makeService();
    rubricCriterionFindMany.mockResolvedValue([
      { id: 'c1', levels: [{ score: 1 }, { score: 2 }, { score: 3 }, { score: 4 }] },
    ]);

    await expect(
      service.upsertVerdict('d1', { indicatorNo: 1, finalScore: 10 }),
    ).rejects.toThrow(BadRequestException);
    expect(assessmentVerdictUpsert).not.toHaveBeenCalled();
  });

  it('menyimpan keputusan per sub-indikator dan membatasi skor maksimal ke sub itu saja', async () => {
    const { service, rubricCriterionFindMany, assessmentVerdictUpsert } = makeService();
    rubricCriterionFindMany.mockResolvedValue([{ id: 'c2', levels: [{ score: 0 }, { score: 1 }, { score: 2 }] }]);

    await expect(
      service.upsertVerdict('d1', { indicatorNo: 43, subNo: 'II', finalScore: 3 }),
    ).rejects.toThrow(BadRequestException);
    expect(rubricCriterionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ indicatorNo: 43, subNo: 'II' }) }),
    );

    await service.upsertVerdict('d1', { indicatorNo: 43, subNo: 'II', finalScore: 2 });
    expect(assessmentVerdictUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId_indicatorNo_subNo: { documentId: 'd1', indicatorNo: 43, subNo: 'II' } },
        create: expect.objectContaining({ subNo: 'II' }),
      }),
    );
  });

  it('accepts a decimal finalScore between two RubricLevels', async () => {
    const { service, rubricCriterionFindMany, assessmentVerdictUpsert } = makeService();
    rubricCriterionFindMany.mockResolvedValue([
      { id: 'c1', levels: [{ score: 1 }, { score: 2 }, { score: 3 }, { score: 4 }] },
    ]);

    await service.upsertVerdict('d1', { indicatorNo: 1, finalScore: 2.35 });

    expect(assessmentVerdictUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ finalScore: 2.35 }),
      }),
    );
  });

  it('skips the max-score guard when the document has no accreditationSetId', async () => {
    const { service, dokumenLedService, rubricCriterionFindMany, assessmentVerdictUpsert } =
      makeService();
    (dokumenLedService.findOne as jest.Mock).mockResolvedValue({ id: 'd1', accreditationSetId: null });

    await service.upsertVerdict('d1', { indicatorNo: 1, finalScore: 999 });

    expect(rubricCriterionFindMany).not.toHaveBeenCalled();
    expect(assessmentVerdictUpsert).toHaveBeenCalled();
  });
});

describe('AssessmentService judge on-demand', () => {
  const originalEnv = process.env.AI_SERVICE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.AI_SERVICE_URL = 'http://ai-service.test';
  });

  afterEach(() => {
    process.env.AI_SERVICE_URL = originalEnv;
    global.fetch = originalFetch;
  });

  it('runJudge returns 404 for a session outside the tenant/prodi scope and never calls apps/ai', async () => {
    const { service, assessmentSessionFindFirst } = makeService();
    assessmentSessionFindFirst.mockResolvedValue(null);
    global.fetch = jest.fn();

    await expect(service.runJudge('sess-lain', {})).rejects.toThrow(NotFoundException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('runJudge sends an empty object for a whole-session judge', async () => {
    const { service } = makeService();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ judge_id: 'j1', total: 2, skipped: 0 }) });

    const result = await service.runJudge('sess1', {});

    expect(global.fetch).toHaveBeenCalledWith(
      'http://ai-service.test/assessment/sess1/judge',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
    );
    expect(result).toEqual({ judge_id: 'j1', total: 2, skipped: 0 });
  });

  it('runJudge treats an empty indicator list as a whole-session judge (sends {})', async () => {
    const { service } = makeService();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    await service.runJudge('sess1', { indicators: [] });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://ai-service.test/assessment/sess1/judge',
      expect.objectContaining({ body: JSON.stringify({}) }),
    );
  });

  it('runJudge maps the indicator list to apps/ai snake_case, defaulting subNo to empty', async () => {
    const { service } = makeService();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    await service.runJudge('sess1', { indicators: [{ indicatorNo: 7 }, { indicatorNo: 43, subNo: 'II' }] });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://ai-service.test/assessment/sess1/judge',
      expect.objectContaining({
        body: JSON.stringify({
          indicators: [
            { indicator_no: 7, sub_no: '' },
            { indicator_no: 43, sub_no: 'II' },
          ],
        }),
      }),
    );
  });

  it.each([
    [{ indicators: [{ indicatorNo: 0 }] }],
    [{ indicators: [{ indicatorNo: 1.5 }] }],
    [{ indicators: [{ indicatorNo: 3, subNo: 5 as unknown as string }] }],
    [{ indicators: [null as never] }],
  ])('runJudge rejects a malformed indicator list %j without calling apps/ai', async (dto) => {
    const { service } = makeService();
    global.fetch = jest.fn();

    await expect(service.runJudge('sess1', dto)).rejects.toThrow(BadRequestException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('runJudge raises a bad gateway when apps/ai is unreachable or refuses', async () => {
    const { service } = makeService();
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.runJudge('sess1', {})).rejects.toThrow(BadGatewayException);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(service.runJudge('sess1', {})).rejects.toThrow(BadGatewayException);
  });

  it('findJudgeStatus scopes the run through its own session id', async () => {
    const { service, assessmentSessionFindFirst } = makeService();
    const body = { judge_id: 'j1', session_id: 'sess1', status: 'running', total: 2, done: 1, skipped: 0, failed: 0 };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });

    const result = await service.findJudgeStatus('j1');

    expect(global.fetch).toHaveBeenCalledWith('http://ai-service.test/assessment/judge/j1');
    expect(assessmentSessionFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'sess1' }) }));
    expect(result).toEqual(body);
  });

  it('findJudgeStatus maps an unknown run to 404 and rejects a run of a foreign session', async () => {
    const { service, assessmentSessionFindFirst } = makeService();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(service.findJudgeStatus('hilang')).rejects.toThrow(NotFoundException);

    assessmentSessionFindFirst.mockResolvedValue(null);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ session_id: 'sess-lain' }) });
    await expect(service.findJudgeStatus('j2')).rejects.toThrow(NotFoundException);
  });
});

describe('AssessmentService never exposes judgeEvidence', () => {
  it('findResults omits judgeEvidence', async () => {
    const { service, findMany } = makeService();

    await service.findResults('sess1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ omit: { judgeEvidence: true } }));
  });

  it('findResultsForDocument omits judgeEvidence', async () => {
    const { service, findMany } = makeService();

    await service.findResultsForDocument('d1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ omit: { judgeEvidence: true } }));
  });
});
