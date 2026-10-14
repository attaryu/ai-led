import { BabDokumenService } from './bab-dokumen.service';
import type { BabAccessService } from './bab-access.service';
import type { TenantContextService } from '../tenant/tenant-context.service';

/** findAllForDokumen's live-sync-to-ChapterTemplate step (structure parity with dimas). */
describe('BabDokumenService.findAllForDokumen (live sync)', () => {
  function makeService() {
    const prisma = {
      documentChapter: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      accreditationSet: {
        findUnique: jest.fn().mockResolvedValue({ panduanId: 'g1' }),
      },
      chapterTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const access: Pick<BabAccessService, 'findDokumenScoped'> = {
      findDokumenScoped: jest
        .fn()
        .mockResolvedValue({ id: 'doc-1', studyProgramId: 'prodi-1', accreditationSetId: 'set-1' }),
    };
    const tenantContext = { getOrThrow: jest.fn() };
    const service = new BabDokumenService(
      prisma as never,
      tenantContext as never as TenantContextService,
      access as BabAccessService,
    );
    return { service, prisma, access };
  }

  it('does nothing when the document has no accreditation set', async () => {
    const { service, prisma, access } = makeService();
    (access.findDokumenScoped as jest.Mock).mockResolvedValue({
      id: 'doc-1',
      studyProgramId: 'prodi-1',
      accreditationSetId: null,
    });

    await service.findAllForDokumen('doc-1');

    expect(prisma.accreditationSet.findUnique).not.toHaveBeenCalled();
  });

  it('does nothing when the set has no Panduan attached', async () => {
    const { service, prisma } = makeService();
    prisma.accreditationSet.findUnique.mockResolvedValue({ panduanId: null });

    await service.findAllForDokumen('doc-1');

    expect(prisma.chapterTemplate.findMany).not.toHaveBeenCalled();
  });

  it('creates missing chapters for template bab not yet stamped on this document', async () => {
    const { service, prisma } = makeService();
    prisma.chapterTemplate.findMany.mockResolvedValue([
      { order: 1, title: 'Pendahuluan' },
      { order: 2, title: 'Tujuan dan Makna Evaluasi Diri' },
    ]);
    prisma.documentChapter.findMany
      .mockResolvedValueOnce([{ chapterOrder: 1, chapterTitle: 'Pendahuluan' }])
      .mockResolvedValueOnce([]);

    await service.findAllForDokumen('doc-1');

    expect(prisma.documentChapter.create).toHaveBeenCalledWith({
      data: {
        documentId: 'doc-1',
        chapterOrder: 2,
        chapterTitle: 'Tujuan dan Makna Evaluasi Diri',
        workingContent: {},
      },
    });
  });

  it('renames a chapter whose title changed in the confirmed Panduan, without touching its content', async () => {
    const { service, prisma } = makeService();
    prisma.chapterTemplate.findMany.mockResolvedValue([{ order: 1, title: 'Judul Baru' }]);
    prisma.documentChapter.findMany
      .mockResolvedValueOnce([{ chapterOrder: 1, chapterTitle: 'Judul Lama' }])
      .mockResolvedValueOnce([]);

    await service.findAllForDokumen('doc-1');

    expect(prisma.documentChapter.updateMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', chapterOrder: 1 },
      data: { chapterTitle: 'Judul Baru' },
    });
    expect(prisma.documentChapter.create).not.toHaveBeenCalled();
  });

  it('leaves an orphaned chapter (order no longer in the template) untouched, does not delete it', async () => {
    const { service, prisma } = makeService();
    prisma.chapterTemplate.findMany.mockResolvedValue([{ order: 1, title: 'Pendahuluan' }]);
    prisma.documentChapter.findMany
      .mockResolvedValueOnce([
        { chapterOrder: 1, chapterTitle: 'Pendahuluan' },
        { chapterOrder: 5, chapterTitle: 'Bab Lama yang Sudah Tidak Ada di Struktur Baru' },
      ])
      .mockResolvedValueOnce([]);

    await service.findAllForDokumen('doc-1');

    expect(prisma.documentChapter.create).not.toHaveBeenCalled();
    expect(prisma.documentChapter.updateMany).not.toHaveBeenCalled();
  });

  it('skips the transaction entirely when everything already matches', async () => {
    const { service, prisma } = makeService();
    prisma.chapterTemplate.findMany.mockResolvedValue([{ order: 1, title: 'Pendahuluan' }]);
    prisma.documentChapter.findMany
      .mockResolvedValueOnce([{ chapterOrder: 1, chapterTitle: 'Pendahuluan' }])
      .mockResolvedValueOnce([]);

    await service.findAllForDokumen('doc-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('BabDokumenService.findAllForDokumen (sections)', () => {
  function makeService(chapters: unknown[]) {
    const prisma = { documentChapter: { findMany: jest.fn().mockResolvedValue(chapters) } };
    const access = {
      findDokumenScoped: jest
        .fn()
        .mockResolvedValue({ id: 'doc-1', studyProgramId: 'prodi-1', accreditationSetId: null }),
    };
    const service = new BabDokumenService(prisma as never, {} as never, access as never);
    return { service, prisma };
  }

  const sec = (id: string, locked: boolean, reviewSubmittedAt: Date | null = null) => ({
    id,
    parentId: null,
    order: 1,
    title: 't',
    marker: null,
    status: 'GENERATED',
    error: null,
    locked,
    reviewSubmittedAt,
    qualityAssuranceNote: null,
    notedByName: null,
    notedAt: null,
  });

  it('selects only lightweight section columns, scoped to the document', async () => {
    const { service, prisma } = makeService([]);
    await service.findAllForDokumen('doc-1');
    const args = prisma.documentChapter.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ documentId: 'doc-1' });
    const select = args.include.sections.select;
    expect(Object.keys(select).sort()).toEqual(
      ['error', 'id', 'locked', 'marker', 'notedAt', 'notedByName', 'order', 'parentId', 'qualityAssuranceNote', 'reviewSubmittedAt', 'status', 'title'].sort(),
    );
    for (const heavy of ['content', 'guidance', 'tableSpec', 'lkpsList', 'lkpsNeeded', 'selectedEvidenceIds', 'activeCheckpointId']) {
      expect(select).not.toHaveProperty(heavy);
    }
  });

  it('returns sections and derives chapter flags; chapters without sections keep theirs and get []', async () => {
    const at = new Date('2026-09-21');
    const { service } = makeService([
      { id: 'c1', locked: false, reviewSubmittedAt: null, sections: [sec('a', true), sec('b', true, at)] },
      { id: 'c2', locked: true, reviewSubmittedAt: null, sections: [] },
    ]);
    const [c1, c2] = await service.findAllForDokumen('doc-1');
    expect(c1.locked).toBe(true);
    expect(c1.reviewSubmittedAt).toBe(at);
    expect(c1.sections.map((s) => s.id)).toEqual(['a', 'b']);
    expect(c2.locked).toBe(true);
    expect(c2.sections).toEqual([]);
  });
});
