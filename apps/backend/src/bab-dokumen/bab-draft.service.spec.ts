import { NotFoundException } from '@nestjs/common';
import { BabDraftService } from './bab-draft.service';
import type { BabAccessService } from './bab-access.service';

/** findRubrik discopes by accreditationSetId (chapterOrder alone repeats across sets). */
describe('BabDraftService.findRubrik', () => {
  function makeService(babOverrides: Partial<Record<string, unknown>> = {}) {
    const prisma = {
      rubricCriterionChapter: {
        findMany: jest.fn().mockResolvedValue([
          { criterion: { id: 'c1', accreditationSetId: 'set-a' } },
        ]),
      },
    };
    const access: Pick<BabAccessService, 'findOneScoped'> = {
      findOneScoped: jest.fn().mockResolvedValue({
        id: 'bab-1',
        chapterOrder: 2,
        document: { accreditationSetId: 'set-a' },
        ...babOverrides,
      }),
    };
    const service = new BabDraftService(prisma as never, {} as never, access as BabAccessService);
    return { service, prisma, access };
  }

  it('returns [] without querying Prisma when the document has no chosen set', async () => {
    const { service, prisma } = makeService({ document: { accreditationSetId: null } });
    const result = await service.findRubrik('bab-1');
    expect(result).toEqual([]);
    expect(prisma.rubricCriterionChapter.findMany).not.toHaveBeenCalled();
  });

  it('scopes the lookup to chapterOrder AND the document\'s accreditationSetId', async () => {
    const { service, prisma } = makeService();
    await service.findRubrik('bab-1');
    expect(prisma.rubricCriterionChapter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chapterOrder: 2, criterion: { accreditationSetId: 'set-a' } },
      }),
    );
  });

  it('returns the criterion rows, not the join rows', async () => {
    const { service } = makeService();
    const result = await service.findRubrik('bab-1');
    expect(result).toEqual([{ id: 'c1', accreditationSetId: 'set-a' }]);
  });
});

/** restoreSectionDraft copies a checkpoint's snapshot back onto its own section, and only its own. */
describe('BabDraftService.restoreSectionDraft', () => {
  function makeService(draft: Record<string, unknown> | null) {
    const prisma = {
      sectionDraft: { findUnique: jest.fn().mockResolvedValue(draft) },
      chapterSection: { update: jest.fn().mockResolvedValue({ id: 'sec-1', content: draft?.contentSnapshot }) },
    };
    const access: Pick<BabAccessService, 'findSectionScoped'> = {
      findSectionScoped: jest.fn().mockResolvedValue({ id: 'sec-1' }),
    };
    const service = new BabDraftService(prisma as never, {} as never, access as BabAccessService);
    return { service, prisma, access };
  }

  it('writes the draft snapshot back onto the section and sets activeCheckpointId', async () => {
    const { service, prisma } = makeService({
      id: 'draft-1',
      sectionId: 'sec-1',
      contentSnapshot: { format: 'html', body: '<p>versi lama</p>' },
    });
    await service.restoreSectionDraft('sec-1', 'draft-1');
    expect(prisma.chapterSection.update).toHaveBeenCalledWith({
      where: { id: 'sec-1' },
      data: { content: { format: 'html', body: '<p>versi lama</p>' }, activeCheckpointId: 'draft-1' },
    });
  });

  it('rejects a draft that belongs to a different section', async () => {
    const { service, prisma } = makeService({ id: 'draft-1', sectionId: 'sec-OTHER', contentSnapshot: {} });
    await expect(service.restoreSectionDraft('sec-1', 'draft-1')).rejects.toThrow(NotFoundException);
    expect(prisma.chapterSection.update).not.toHaveBeenCalled();
  });

  it('rejects a draft id that does not exist', async () => {
    const { service, prisma } = makeService(null);
    await expect(service.restoreSectionDraft('sec-1', 'missing')).rejects.toThrow(NotFoundException);
    expect(prisma.chapterSection.update).not.toHaveBeenCalled();
  });
});

/** deleteSectionDraft removes one checkpoint, and only one that belongs to the section asked for. */
describe('BabDraftService.deleteSectionDraft', () => {
  function makeService(draft: Record<string, unknown> | null) {
    const prisma = {
      sectionDraft: {
        findUnique: jest.fn().mockResolvedValue(draft),
        delete: jest.fn().mockResolvedValue(draft),
        // Pengganti saat draft terpilih dihapus; null = tidak ada versi tersisa.
        findFirst: jest.fn().mockResolvedValue(null),
      },
      chapterSection: { update: jest.fn().mockResolvedValue({}) },
    };
    const access: Pick<BabAccessService, 'findSectionScoped'> = {
      findSectionScoped: jest.fn().mockResolvedValue({ id: 'sec-1' }),
    };
    const service = new BabDraftService(prisma as never, {} as never, access as BabAccessService);
    return { service, prisma, access };
  }

  it('deletes the checkpoint', async () => {
    const { service, prisma } = makeService({ id: 'draft-1', sectionId: 'sec-1' });
    await service.deleteSectionDraft('sec-1', 'draft-1');
    expect(prisma.sectionDraft.delete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
  });

  /** The active checkpoint is deletable on purpose: the FK is ON DELETE SET NULL, so the
   * section keeps its text and only loses the "Aktif" marker. */
  /** Draft terakhir yang sedang tampil: kanvas ikut dikosongkan -- draft ADALAH narasinya. */
  it('clears the section when the last selected draft is deleted', async () => {
    const { service, prisma, access } = makeService({ id: 'draft-1', sectionId: 'sec-1' });
    (access.findSectionScoped as jest.Mock).mockResolvedValue({
      id: 'sec-1',
      activeCheckpointId: 'draft-1',
    });
    await service.deleteSectionDraft('sec-1', 'draft-1');
    expect(prisma.sectionDraft.delete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
    expect(prisma.chapterSection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ activeCheckpointId: null, status: 'PENDING' }),
      }),
    );
  });

  /** Masih ada versi lain: kanvas berpindah ke sana, bukan dikosongkan. */
  it('falls back to the newest remaining draft', async () => {
    const { service, prisma, access } = makeService({ id: 'draft-2', sectionId: 'sec-1' });
    (access.findSectionScoped as jest.Mock).mockResolvedValue({
      id: 'sec-1',
      activeCheckpointId: 'draft-2',
    });
    prisma.sectionDraft.findFirst.mockResolvedValue({
      id: 'draft-1',
      contentSnapshot: { format: 'html', body: '<p>versi lama</p>' },
    });
    await service.deleteSectionDraft('sec-1', 'draft-2');
    expect(prisma.chapterSection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ activeCheckpointId: 'draft-1' }),
      }),
    );
  });

  it('rejects a draft that belongs to a different section', async () => {
    const { service, prisma } = makeService({ id: 'draft-1', sectionId: 'sec-OTHER' });
    await expect(service.deleteSectionDraft('sec-1', 'draft-1')).rejects.toThrow(NotFoundException);
    expect(prisma.sectionDraft.delete).not.toHaveBeenCalled();
  });

  it('rejects a draft id that does not exist', async () => {
    const { service, prisma } = makeService(null);
    await expect(service.deleteSectionDraft('sec-1', 'missing')).rejects.toThrow(NotFoundException);
    expect(prisma.sectionDraft.delete).not.toHaveBeenCalled();
  });
});
