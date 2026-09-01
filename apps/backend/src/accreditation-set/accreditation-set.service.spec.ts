import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
      delete: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue(undefined),
    },
    referenceGuide: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    chapterTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const tenantContext: Pick<TenantContextService, 'getOrThrow'> = {
    getOrThrow: jest.fn().mockReturnValue({ tenantId, userId: 'u1', role: 'PENJAMIN_MUTU', studyProgramId: null }),
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
  it('copies all criteria (with levels and chapters) into a new DRAF set', async () => {
    const { service, prisma } = makeService();
    const source = {
      ...makeSet(),
      lembaga: 'LAM Teknik',
      documents: [{ type: TipePanduan.DOKUMEN_RUBRIK, title: 'Rubrik', fileUrl: 'k', fileType: 'pdf' }],
      criteria: [makeCriterion(), makeCriterion({ id: 'c2', indicatorNo: 2 })],
    };
    prisma.accreditationSet.findFirstOrThrow.mockResolvedValue(source);
    prisma.accreditationSet.findMany.mockResolvedValue([{ nama: source.nama }]);

    await service.duplicate('s1');

    const callArg = prisma.accreditationSet.create.mock.calls[0][0];
    expect(callArg.data.status).toBe(AccreditationSetStatus.DRAF);
    expect(callArg.data.nama).toBe(`${source.nama} (salinan)`);
    expect(callArg.data.criteria.create).toHaveLength(2);
    expect(callArg.data.documents.create).toHaveLength(1);
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
});

describe('AccreditationSetService.attachDocument', () => {
  it('enqueues INGESTION_RUBRIK_DOKUMEN and marks DIPROSES for DOKUMEN_RUBRIK', async () => {
    const { service, prisma, jobsService } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.referenceGuide.findFirst.mockResolvedValue(null);
    prisma.referenceGuide.create.mockResolvedValue({ id: 'rg1' });

    await service.attachDocument('s1', TipePanduan.DOKUMEN_RUBRIK, {
      fileKey: 'tenant/s1/matriks.pdf',
      title: 'Matriks Penilaian',
    });

    expect(prisma.accreditationSet.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { criteriaParseStatus: 'DIPROSES', criteriaParseError: null },
    });
    expect(jobsService.enqueue).toHaveBeenCalledWith('INGESTION_RUBRIK_DOKUMEN', {
      accreditationSetId: 's1',
      fileUrl: 'tenant/s1/matriks.pdf',
    });
  });

  it('enqueues INGESTION_STRUKTUR_DOKUMEN and marks structureParseStatus DIPROSES for PANDUAN_LAM', async () => {
    const { service, prisma, jobsService } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.referenceGuide.findFirst.mockResolvedValue(null);
    prisma.referenceGuide.create.mockResolvedValue({ id: 'rg1' });

    await service.attachDocument('s1', TipePanduan.PANDUAN_LAM, {
      fileKey: 'tenant/s1/panduan.pdf',
      title: 'Panduan LAM',
    });

    expect(prisma.accreditationSet.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { structureParseStatus: 'DIPROSES', structureParseError: null },
    });
    expect(jobsService.enqueue).toHaveBeenCalledWith('INGESTION_STRUKTUR_DOKUMEN', {
      accreditationSetId: 's1',
      fileUrl: 'tenant/s1/panduan.pdf',
    });
  });

  it('does not enqueue anything for TEMPLATE_LKPS', async () => {
    const { service, prisma, jobsService } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.ledDocument.count.mockResolvedValue(0);
    prisma.referenceGuide.findFirst.mockResolvedValue(null);
    prisma.referenceGuide.create.mockResolvedValue({ id: 'rg1' });

    await service.attachDocument('s1', TipePanduan.TEMPLATE_LKPS, {
      fileKey: 'tenant/s1/lkps.xlsx',
      title: 'Template LKPS',
    });

    expect(jobsService.enqueue).not.toHaveBeenCalled();
    expect(prisma.accreditationSet.update).not.toHaveBeenCalled();
  });
});

describe('AccreditationSetService.markReady', () => {
  it('rejects when a reference document slot is still empty', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue({
      ...makeSet(),
      documents: [{ type: TipePanduan.DOKUMEN_RUBRIK }],
      criteria: [makeCriterion()],
    });

    await expect(service.markReady('s1')).rejects.toThrow(BadRequestException);
  });

  it('rejects when there are no criteria yet', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue({
      ...makeSet(),
      documents: [
        { type: TipePanduan.DOKUMEN_RUBRIK },
        { type: TipePanduan.PANDUAN_LAM },
        { type: TipePanduan.TEMPLATE_LKPS },
      ],
      criteria: [],
    });

    await expect(service.markReady('s1')).rejects.toThrow(BadRequestException);
  });
});

describe('AccreditationSetService.findChapterTemplates', () => {
  it('returns the ordered chapter/sub-bab structure for this set', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(makeSet());
    prisma.chapterTemplate.findMany.mockResolvedValue([
      { id: 'ct1', order: 1, title: 'Pendahuluan', subBab: [] },
    ]);

    const result = await service.findChapterTemplates('s1');

    expect(prisma.chapterTemplate.findMany).toHaveBeenCalledWith({
      where: { accreditationSetId: 's1' },
      orderBy: { order: 'asc' },
      include: { subBab: { orderBy: { order: 'asc' } } },
    });
    expect(result).toEqual([{ id: 'ct1', order: 1, title: 'Pendahuluan', subBab: [] }]);
  });

  it('rejects when the set does not exist for this tenant', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findFirst.mockResolvedValue(null);

    await expect(service.findChapterTemplates('s1')).rejects.toThrow(NotFoundException);
  });
});
