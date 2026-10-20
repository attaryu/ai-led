import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AccreditationSetStatus, RubricScoreType, TipePanduan } from '@ai-led/db';
import { AccreditationSetService } from './accreditation-set.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import type { StorageService } from '../storage/storage.service';
import type { JobsService } from '../jobs/jobs.service';

function makeSet(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    tenantId: 't1',
    nama: 'LAM Teknik (Default)',
    lembaga: 'LAM Teknik',
    tahunSiklus: 2025,
    status: AccreditationSetStatus.DRAF,
    panduanId: null,
    ...overrides,
  };
}

function makeCriterion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c1',
    accreditationSetId: 's1',
    indicatorNo: 1,
    criterionCode: 'C1',
    criterionGroup: 'Kelompok 1',
    description: 'Deskripsi',
    scoreType: RubricScoreType.KUALITATIF,
    lkpsTableRefs: [],
    formula: null,
    subScoreFormula: null,
    levels: [{ score: 4, description: 'Sangat baik' }],
    criterionChapters: [{ chapterOrder: 2 }],
    ...overrides,
  };
}

/** Bentuk UpsertCriterionDto (input request), beda dari makeCriterion() yang meniru baris Prisma tersimpan. */
function makeCriterionInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    indicatorNo: 1,
    criterionCode: 'C1',
    criterionGroup: 'Kelompok 1',
    description: 'Deskripsi',
    scoreType: RubricScoreType.KUALITATIF,
    lkpsTableRefs: [],
    formula: null,
    subScoreFormula: null,
    levels: [{ score: 4, description: 'Sangat baik' }],
    chapterOrders: [2],
    ...overrides,
  };
}

function makeService(tenantId = 't1') {
  const prisma = {
    accreditationSet: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's-new', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data })),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    ledDocument: {
      count: jest.fn().mockResolvedValue(0),
    },
    rubricCriterion: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue(undefined),
    },
    rubricCriterionGroup: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `baru-${data.label}`, ...data })),
    },
    setSectionCriterionLink: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    referenceGuide: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'u1', fullName: 'Budi' }),
    },
    chapterTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    subBabTemplate: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
  const tenantContext: Pick<TenantContextService, 'getOrThrow' | 'runInManagedTransaction'> = {
    getOrThrow: jest.fn().mockReturnValue({ tenantId, userId: 'u1', role: 'PENJAMIN_MUTU', studyProgramId: null }),
    runInManagedTransaction: jest.fn().mockImplementation((fn: () => unknown) => fn()),
  };
  const storage: Pick<StorageService, 'headObject' | 'deleteObject'> = {
    headObject: jest.fn().mockResolvedValue({ sizeBytes: 1, contentType: 'application/pdf' }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const jobsService: Pick<JobsService, 'enqueue'> = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AccreditationSetService(
    prisma as never,
    tenantContext as TenantContextService,
    storage as StorageService,
    jobsService as JobsService,
  );
  return { service, prisma, storage, jobsService };
}

describe('AccreditationSetService.create', () => {
  it('creates a set always starting as DRAF', async () => {
    const { service, prisma } = makeService();
    const created = await service.create({ nama: 'Set Baru', lembaga: 'LAM Teknik', tahunSiklus: 2026 });
    expect(created.status).toBe(AccreditationSetStatus.DRAF);
    expect(prisma.accreditationSet.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 't1', status: AccreditationSetStatus.DRAF }) }),
    );
  });
});

describe('AccreditationSetService.replaceCriteria (lock check)', () => {
  it('rejects when the set is already in use by a LedDocument', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(2);

    await expect(
      service.replaceCriteria('s1', { criteria: [] }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a duplicate indicatorNo within the same payload', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);

    const dup = makeCriterionInput();
    await expect(
      service.replaceCriteria('s1', { criteria: [dup as never, dup as never] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('mengizinkan nomor indikator sama bila sub-indikatornya berbeda, dan menyimpan subNo', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.accreditationSet.findFirstOrThrow.mockResolvedValue({ ...makeSet(), criteria: [makeCriterion()] });

    const satu = { ...makeCriterionInput(), subNo: 'I', criterionCode: '43.I' };
    const dua = { ...makeCriterionInput(), subNo: 'II', criterionCode: '43.II' };
    await service.replaceCriteria('s1', { criteria: [satu as never, dua as never] });

    expect(prisma.rubricCriterion.create).toHaveBeenCalledTimes(2);
    expect(prisma.rubricCriterion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subNo: 'II', criterionCode: '43.II' }) }),
    );
  });

  it('mempertahankan group_id kriteria saat daftar diganti (replace-all tidak memutus hierarki)', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.accreditationSet.findFirstOrThrow.mockResolvedValue({ ...makeSet(), criteria: [] });
    prisma.rubricCriterion.findMany.mockResolvedValue([{ indicatorNo: 43, subNo: 'II', groupId: 'g1' }]);

    await service.replaceCriteria('s1', {
      criteria: [{ ...makeCriterionInput(), indicatorNo: 43, subNo: 'II' } as never],
    });

    expect(prisma.rubricCriterion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ indicatorNo: 43, groupId: 'g1' }) }),
    );
  });

  it('tetap menolak pasangan nomor + sub-indikator yang kembar', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);

    const satu = { ...makeCriterionInput(), subNo: 'I' };
    await expect(
      service.replaceCriteria('s1', { criteria: [satu as never, { ...satu } as never] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('replaces the whole criteria list when unlocked', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.accreditationSet.findFirstOrThrow.mockResolvedValue({ ...makeSet(), criteria: [makeCriterion()] });

    const result = await service.replaceCriteria('s1', { criteria: [makeCriterionInput() as never] });
    expect(prisma.rubricCriterion.deleteMany).toHaveBeenCalledWith({ where: { accreditationSetId: 's1' } });
    expect(prisma.rubricCriterion.create).toHaveBeenCalledTimes(1);
    expect(result.criteria).toHaveLength(1);
  });
});

describe('AccreditationSetService.removeCriterion (lock check)', () => {
  it('rejects when the set is in use', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(1);

    await expect(service.removeCriterion('s1', 'c1')).rejects.toThrow(ConflictException);
  });
});

describe('AccreditationSetService.remove (delete)', () => {
  it('rejects deleting a set that is still in use', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(3);

    await expect(service.remove('s1')).rejects.toThrow(ConflictException);
    expect(prisma.accreditationSet.delete).not.toHaveBeenCalled();
  });

  it('deletes a set with no LedDocument pointing at it', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);

    await service.remove('s1');
    expect(prisma.accreditationSet.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('throws NotFoundException for a set outside the caller tenant', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(null);

    await expect(service.remove('s1')).rejects.toThrow(NotFoundException);
  });
});

describe('AccreditationSetService.duplicate', () => {
  it('copies all criteria (with levels and chapters) and the Panduan pointer into a new DRAF set', async () => {
    const { service, prisma } = makeService();
    const source = {
      ...makeSet({ panduanId: 'g1' }),
      lembaga: 'LAM Teknik',
      documents: [
        { type: TipePanduan.DOKUMEN_RUBRIK, title: 'Rubrik', fileUrl: 'k', fileType: 'pdf' },
        // Legacy pre-migration row -- must NOT be copied, Panduan is reusable
        // via panduanId now, not a per-set ReferenceGuide.
        { type: TipePanduan.PANDUAN_LAM, title: 'Panduan lama', fileUrl: 'p', fileType: 'pdf' },
      ],
      criteria: [makeCriterion(), makeCriterion({ id: 'c2', indicatorNo: 2 })],
    };
    prisma.accreditationSet.findFirstOrThrow.mockResolvedValue(source);
    prisma.accreditationSet.findMany.mockResolvedValue([{ nama: source.nama }]);

    await service.duplicate('s1');

    const callArg = prisma.accreditationSet.create.mock.calls[0][0];
    expect(callArg.data.status).toBe(AccreditationSetStatus.DRAF);
    expect(callArg.data.nama).toBe(`${source.nama} (salinan)`);
    expect(callArg.data.panduanId).toBe('g1');
    expect(callArg.data.criteria.create).toHaveLength(2);
    expect(callArg.data.documents.create).toHaveLength(1);
    expect(callArg.data.documents.create[0].type).toBe(TipePanduan.DOKUMEN_RUBRIK);
  });

  it('menyalin grup hierarki (induk lebih dulu) dan menautkan ulang kriterianya', async () => {
    const { service, prisma } = makeService();
    const source = {
      ...makeSet(),
      documents: [],
      criteria: [makeCriterion({ id: 'c1', indicatorNo: 43, subNo: 'I', groupId: 'g-anak' })],
    };
    prisma.accreditationSet.findFirstOrThrow.mockResolvedValue(source);
    prisma.accreditationSet.findMany.mockResolvedValue([]);
    prisma.accreditationSet.create.mockResolvedValue({ id: 'baru', criteria: [] });
    // anak tercantum SEBELUM induknya -- salinan tetap harus membuat induk lebih dulu
    prisma.rubricCriterionGroup.findMany.mockResolvedValue([
      { id: 'g-anak', parentId: 'g-induk', level: 'IKU', order: 1, marker: null, label: 'Anak' },
      { id: 'g-induk', parentId: null, level: 'KRITERIA', order: 0, marker: 'III', label: 'Induk' },
    ]);

    await service.duplicate('s1');

    const urutanBuat = prisma.rubricCriterionGroup.create.mock.calls.map((c: any) => c[0].data.label);
    expect(urutanBuat).toEqual(['Induk', 'Anak']);
    expect(prisma.rubricCriterionGroup.create.mock.calls[1][0].data.parentId).toBe('baru-Induk');
    expect(prisma.rubricCriterion.updateMany).toHaveBeenCalledWith({
      where: { accreditationSetId: 'baru', indicatorNo: 43, subNo: 'I' },
      data: { groupId: 'baru-Anak' },
    });
  });
});

describe('AccreditationSetService.findAll', () => {
  it('includes document types and a criteria count for the list view, not full criteria', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findMany.mockResolvedValue([
      { ...makeSet(), documents: [{ type: TipePanduan.DOKUMEN_RUBRIK }], _count: { criteria: 3 } },
    ]);

    const result = await service.findAll();

    expect(prisma.accreditationSet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          documents: { select: { type: true } },
          panduan: { select: { id: true, title: true } },
          _count: { select: { criteria: true } },
        },
      }),
    );
    expect(result[0]._count.criteria).toBe(3);
  });
});

describe('AccreditationSetService.removeDocument (lock check)', () => {
  it('rejects when the set is in use', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(1);

    await expect(service.removeDocument('s1', TipePanduan.DOKUMEN_RUBRIK)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.referenceGuide.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes the slot for that type when unlocked', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);

    await service.removeDocument('s1', TipePanduan.DOKUMEN_RUBRIK);

    expect(prisma.referenceGuide.deleteMany).toHaveBeenCalledWith({
      where: { accreditationSetId: 's1', type: TipePanduan.DOKUMEN_RUBRIK },
    });
  });

  it('rejects PANDUAN_LAM -- reusable now, use detachPanduan instead', async () => {
    const { service } = makeService();
    await expect(service.removeDocument('s1', TipePanduan.PANDUAN_LAM)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('AccreditationSetService.attachDocument', () => {
  it('enqueues INGESTION_RUBRIK_DOKUMEN and marks DIPROSES for DOKUMEN_RUBRIK', async () => {
    const { service, prisma, jobsService } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.referenceGuide.findFirst.mockResolvedValue(null);
    prisma.referenceGuide.create.mockResolvedValue({ id: 'rg1' });

    await service.attachDocument('s1', TipePanduan.DOKUMEN_RUBRIK, {
      fileKey: 't1/s1/matriks.pdf',
      title: 'Matriks Penilaian',
    });

    expect(prisma.accreditationSet.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { criteriaParseStatus: 'DIPROSES', criteriaParseError: null },
    });
    expect(jobsService.enqueue).toHaveBeenCalledWith('INGESTION_RUBRIK_DOKUMEN', {
      accreditationSetId: 's1',
      fileUrl: 't1/s1/matriks.pdf',
    });
  });

  it('rejects PANDUAN_LAM -- reusable now, use uploadPanduan/attachPanduan instead', async () => {
    const { service } = makeService();
    await expect(
      service.attachDocument('s1', TipePanduan.PANDUAN_LAM, {
        fileKey: 't1/s1/panduan.pdf',
        title: 'Panduan LAM',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not enqueue anything for TEMPLATE_LKPS', async () => {
    const { service, prisma, jobsService } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.referenceGuide.findFirst.mockResolvedValue(null);
    prisma.referenceGuide.create.mockResolvedValue({ id: 'rg1' });

    await service.attachDocument('s1', TipePanduan.TEMPLATE_LKPS, {
      fileKey: 't1/s1/lkps.xlsx',
      title: 'Template LKPS',
    });

    expect(jobsService.enqueue).not.toHaveBeenCalled();
    expect(prisma.accreditationSet.update).not.toHaveBeenCalled();
  });
});

describe('AccreditationSetService.markReady', () => {
  it('rejects when Matriks Penilaian is missing (panduanId set but no DOKUMEN_RUBRIK)', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue({
      ...makeSet({ panduanId: 'g1' }),
      documents: [],
      criteria: [makeCriterion()],
    });

    await expect(service.markReady('s1')).rejects.toThrow(BadRequestException);
  });

  it('rejects when Panduan Penulisan is not attached (panduanId null)', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue({
      ...makeSet({ panduanId: null }),
      documents: [{ type: TipePanduan.DOKUMEN_RUBRIK }, { type: TipePanduan.TEMPLATE_LKPS }],
      criteria: [makeCriterion()],
    });

    await expect(service.markReady('s1')).rejects.toThrow(BadRequestException);
  });

  it('rejects when there are no criteria yet', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue({
      ...makeSet({ panduanId: 'g1' }),
      documents: [
        { type: TipePanduan.DOKUMEN_RUBRIK },
        { type: TipePanduan.TEMPLATE_LKPS },
      ],
      criteria: [],
    });

    await expect(service.markReady('s1')).rejects.toThrow(BadRequestException);
  });

  it('marks SIAP when Panduan is attached, DOKUMEN_RUBRIK present, and criteria exist', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue({
      ...makeSet({ panduanId: 'g1' }),
      documents: [{ type: TipePanduan.DOKUMEN_RUBRIK }],
      criteria: [makeCriterion()],
    });

    await service.markReady('s1');

    expect(prisma.accreditationSet.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: AccreditationSetStatus.SIAP },
    });
  });
});

describe('AccreditationSetService.findChapterTemplates', () => {
  it("returns the ordered chapter/sub-bab structure for this set's Panduan", async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet({ panduanId: 'g1' }));
    prisma.chapterTemplate.findMany.mockResolvedValue([
      {
        id: 'ct1', order: 1, title: 'Pendahuluan',
        subBab: [
          { id: 'a', parentId: null, order: 1, title: 'A' },
          { id: 'a1', parentId: 'a', order: 1, title: 'A.1' },
          { id: 'a1x', parentId: 'a1', order: 1, title: '1' },
          { id: 'a1xa', parentId: 'a1x', order: 1, title: 'a)' },
        ],
      },
    ]);

    const result = await service.findChapterTemplates('s1');

    expect(prisma.chapterTemplate.findMany).toHaveBeenCalledWith({
      where: { guideId: 'g1' },
      orderBy: { order: 'asc' },
      include: { subBab: { orderBy: { order: 'asc' } } },
    });
    // Any depth (dimas), not capped at sub-sub-bab.
    const a = result[0].subBab[0];
    expect(a.children[0].children[0].children[0]).toMatchObject({ id: 'a1xa', children: [] });
    expect(result[0].subBab).toHaveLength(1);
  });

  it('returns [] without querying when the set has no Panduan attached', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet({ panduanId: null }));

    const result = await service.findChapterTemplates('s1');

    expect(result).toEqual([]);
    expect(prisma.chapterTemplate.findMany).not.toHaveBeenCalled();
  });

  it('rejects when the set does not exist for this tenant', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(null);

    await expect(service.findChapterTemplates('s1')).rejects.toThrow(NotFoundException);
  });
});

describe('AccreditationSetService.previewStructure / confirmStructure', () => {
  const originalEnv = process.env.AI_SERVICE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.AI_SERVICE_URL = 'http://ai-service.test';
  });

  afterEach(() => {
    process.env.AI_SERVICE_URL = originalEnv;
    global.fetch = originalFetch;
  });

  it("previewStructure proxies to GET /structure/:panduanId/preview, resolved from the set's panduanId", async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet({ panduanId: 'g1' }));
    const body = { status: 'MENUNGGU_KONFIRMASI', nodes: [{ id: '1', parent_id: null, level: 1, order: 1, title: 'Pendahuluan' }] };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body });

    const result = await service.previewStructure('s1');

    expect(global.fetch).toHaveBeenCalledWith('http://ai-service.test/structure/g1/preview');
    expect(result).toEqual(body);
  });

  it('previewStructure rejects when the set does not exist for this tenant', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(null);
    global.fetch = jest.fn();

    await expect(service.previewStructure('s1')).rejects.toThrow(NotFoundException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('previewStructure rejects when the set has no Panduan attached', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet({ panduanId: null }));
    global.fetch = jest.fn();

    await expect(service.previewStructure('s1')).rejects.toThrow(BadRequestException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('previewStructure raises a bad gateway when the AI service is unreachable', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet({ panduanId: 'g1' }));
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.previewStructure('s1')).rejects.toThrow(BadGatewayException);
  });

  it('confirmStructure posts accepted_ids to the panduanId and returns the commit count', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet({ panduanId: 'g1' }));
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ guideId: 'g1', count: 2 }) });

    const result = await service.confirmStructure('s1', { acceptedIds: ['1', '1.1'] });

    expect(global.fetch).toHaveBeenCalledWith('http://ai-service.test/structure/g1/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepted_ids: ['1', '1.1'] }),
    });
    expect(result).toEqual({ guideId: 'g1', count: 2 });
  });

  it('confirmStructure raises Conflict when the set is not pending confirmation', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet({ panduanId: 'g1' }));
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 409 });

    await expect(service.confirmStructure('s1', { acceptedIds: [] })).rejects.toThrow(ConflictException);
  });
});

describe('AccreditationSetService Panduan library (reusable across sets)', () => {
  it('listPanduan returns tenant-scoped Panduan with bab/set-usage counts', async () => {
    const { service, prisma } = makeService();
    prisma.referenceGuide.findMany.mockResolvedValue([
      {
        id: 'g1',
        title: 'Pedoman LAM Teknik',
        structureParseStatus: 'SIAP',
        structureParseError: null,
        createdAt: new Date('2026-09-01'),
        _count: { chapterTemplates: 4, usedBySets: 2 },
      },
    ]);

    const result = await service.listPanduan();

    expect(prisma.referenceGuide.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', type: TipePanduan.PANDUAN_LAM } }),
    );
    expect(result).toEqual([
      {
        id: 'g1',
        title: 'Pedoman LAM Teknik',
        structureParseStatus: 'SIAP',
        structureParseError: null,
        createdAt: new Date('2026-09-01'),
        jumlahBab: 4,
        jumlahSetPemakai: 2,
      },
    ]);
  });

  it('uploadPanduan creates a tenant-scoped ReferenceGuide and enqueues extraction by guideId', async () => {
    const { service, prisma, jobsService } = makeService();
    prisma.referenceGuide.create.mockResolvedValue({ id: 'g1' });

    await service.uploadPanduan({ fileKey: 't1/panduan.pdf', title: 'Pedoman Baru' });

    expect(prisma.referenceGuide.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          type: TipePanduan.PANDUAN_LAM,
          title: 'Pedoman Baru',
          structureParseStatus: 'DIPROSES',
        }),
      }),
    );
    expect(jobsService.enqueue).toHaveBeenCalledWith('INGESTION_STRUKTUR_DOKUMEN', {
      guideId: 'g1',
      fileUrl: 't1/panduan.pdf',
    });
  });

  it('replacePanduan re-uploads into an existing Panduan and re-enqueues extraction', async () => {
    const { service, prisma, jobsService } = makeService();
    prisma.referenceGuide.findFirst.mockResolvedValue({ id: 'g1', tenantId: 't1' });
    prisma.referenceGuide.update.mockResolvedValue({ id: 'g1' });

    await service.replacePanduan('g1', { fileKey: 't1/panduan-v2.pdf', title: 'Pedoman v2' });

    expect(prisma.referenceGuide.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g1' },
        data: expect.objectContaining({ title: 'Pedoman v2', structureParseStatus: 'DIPROSES' }),
      }),
    );
    expect(jobsService.enqueue).toHaveBeenCalledWith('INGESTION_STRUKTUR_DOKUMEN', {
      guideId: 'g1',
      fileUrl: 't1/panduan-v2.pdf',
    });
  });

  it('replacePanduan rejects a Panduan from another tenant', async () => {
    const { service, prisma } = makeService();
    prisma.referenceGuide.findFirst.mockResolvedValue(null);

    await expect(
      service.replacePanduan('g1', { fileKey: 't1/x.pdf', title: 'x' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletePanduan removes an unused Panduan and its storage object', async () => {
    const { service, prisma, storage } = makeService();
    prisma.referenceGuide.findFirst.mockResolvedValue({
      id: 'g1',
      tenantId: 't1',
      fileUrl: 'tenant/panduan.pdf',
      _count: { usedBySets: 0 },
    });
    prisma.referenceGuide.delete.mockResolvedValue({ id: 'g1' });

    await service.deletePanduan('g1');

    expect(prisma.referenceGuide.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
    expect(storage.deleteObject).toHaveBeenCalledWith('tenant/panduan.pdf');
  });

  it('deletePanduan rejects a Panduan still used by any Set', async () => {
    const { service, prisma } = makeService();
    prisma.referenceGuide.findFirst.mockResolvedValue({
      id: 'g1',
      tenantId: 't1',
      fileUrl: 'tenant/panduan.pdf',
      _count: { usedBySets: 2 },
    });

    await expect(service.deletePanduan('g1')).rejects.toThrow(ConflictException);
    expect(prisma.referenceGuide.delete).not.toHaveBeenCalled();
  });

  it('deletePanduan rejects a Panduan from another tenant', async () => {
    const { service, prisma } = makeService();
    prisma.referenceGuide.findFirst.mockResolvedValue(null);

    await expect(service.deletePanduan('g1')).rejects.toThrow(NotFoundException);
  });

  it('attachPanduan points the set at an existing Panduan', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.referenceGuide.findFirst.mockResolvedValue({ id: 'g1', tenantId: 't1' });

    await service.attachPanduan('s1', { panduanId: 'g1' });

    expect(prisma.accreditationSet.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { panduanId: 'g1' },
    });
  });

  it('attachPanduan ke Panduan BERBEDA menghapus tautan section-kriteria lama dan meminta apps/ai menghitung ulang', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet({ panduanId: 'g-lama' }));
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.referenceGuide.findFirst.mockResolvedValue({ id: 'g1', tenantId: 't1' });
    const originalFetch = global.fetch;
    const originalUrl = process.env.AI_SERVICE_URL;
    process.env.AI_SERVICE_URL = 'http://ai-service.test';
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    try {
      await service.attachPanduan('s1', { panduanId: 'g1' });
      expect(prisma.setSectionCriterionLink.deleteMany).toHaveBeenCalledWith({ where: { accreditationSetId: 's1' } });
      expect(global.fetch).toHaveBeenCalledWith('http://ai-service.test/structure/sets/s1/relink', { method: 'POST' });
    } finally {
      global.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.AI_SERVICE_URL;
      else process.env.AI_SERVICE_URL = originalUrl;
    }
  });

  it('attachPanduan ke Panduan yang SAMA tidak menyentuh tautan (menjaga yang sudah dikonfirmasi)', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet({ panduanId: 'g1' }));
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.referenceGuide.findFirst.mockResolvedValue({ id: 'g1', tenantId: 't1' });

    await service.attachPanduan('s1', { panduanId: 'g1' });

    expect(prisma.setSectionCriterionLink.deleteMany).not.toHaveBeenCalled();
  });

  it('attachPanduan tetap berhasil walau apps/ai tidak terjangkau', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet({ panduanId: null }));
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.referenceGuide.findFirst.mockResolvedValue({ id: 'g1', tenantId: 't1' });
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('down'));
    try {
      await expect(service.attachPanduan('s1', { panduanId: 'g1' })).resolves.toBeDefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('attachPanduan rejects when the set is already in use', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(1);

    await expect(service.attachPanduan('s1', { panduanId: 'g1' })).rejects.toThrow(ConflictException);
  });

  it('detachPanduan nulls the pointer without touching the Panduan row itself', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);

    await service.detachPanduan('s1');

    expect(prisma.accreditationSet.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { panduanId: null },
    });
    expect(prisma.referenceGuide.deleteMany).not.toHaveBeenCalled();
    expect(prisma.setSectionCriterionLink.deleteMany).toHaveBeenCalledWith({ where: { accreditationSetId: 's1' } });
  });

  it('toggleSection flips isActive on a sub-bab scoped to the caller tenant', async () => {
    const { service, prisma } = makeService();
    prisma.subBabTemplate.findFirst.mockResolvedValue({ id: 'sb1' });

    await service.toggleSection('sb1', { isActive: false });

    expect(prisma.subBabTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'sb1', chapterTemplate: { guide: { tenantId: 't1' } } },
    });
    expect(prisma.subBabTemplate.update).toHaveBeenCalledWith({
      where: { id: 'sb1' },
      data: { isActive: false },
    });
  });

  it('toggleSection rejects a sub-bab outside the caller tenant', async () => {
    const { service, prisma } = makeService();
    prisma.subBabTemplate.findFirst.mockResolvedValue(null);

    await expect(service.toggleSection('sb1', { isActive: false })).rejects.toThrow(NotFoundException);
    expect(prisma.subBabTemplate.update).not.toHaveBeenCalled();
  });
});

describe('AccreditationSetService file keys', () => {
  it("rejects another tenant's R2 key before touching storage", async () => {
    const { service, storage } = makeService();
    await expect(service.uploadPanduan({ fileKey: 't2/panduan.pdf', title: 'x' })).rejects.toThrow('bukan milik tenant');
    expect(storage.headObject).not.toHaveBeenCalled();
  });
});
