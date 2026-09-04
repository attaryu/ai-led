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
