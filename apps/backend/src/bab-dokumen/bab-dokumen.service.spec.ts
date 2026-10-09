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
