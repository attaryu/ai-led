import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@ai-led/db';
import { BabPipelineService } from './bab-pipeline.service';
import type { BabAccessService } from './bab-access.service';

/** Manual create/update/delete section — the non-LLM CRUD half of BabPipelineService. */
describe('BabPipelineService manual section CRUD', () => {
  function makeService(babOverrides: Partial<Record<string, unknown>> = {}) {
    const prisma = {
      chapterSection: {
        aggregate: jest.fn().mockResolvedValue({ _max: { order: 2 } }),
        create: jest.fn().mockResolvedValue({ id: 'sec-new', order: 3 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'sec-1', chapterId: 'bab-1' }),
        update: jest.fn().mockResolvedValue({ id: 'sec-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'sec-1' }),
      },
    };
    const access: Pick<BabAccessService, 'findOneScoped'> = {
      findOneScoped: jest.fn().mockResolvedValue({ id: 'bab-1', locked: false, ...babOverrides }),
    };
    const service = new BabPipelineService(
      prisma as never,
      {} as never,
      {} as never,
      access as BabAccessService,
    );
    return { service, prisma, access };
  }

  describe('createSection', () => {
    it('appends at max(order)+1 with status PENDING', async () => {
      const { service, prisma } = makeService();
      await service.createSection('bab-1', { title: 'Kebijakan', guidance: 'Bahas dasar hukum' });

      expect(prisma.chapterSection.create).toHaveBeenCalledWith({
        data: {
          chapterId: 'bab-1',
          order: 3,
          title: 'Kebijakan',
          guidance: 'Bahas dasar hukum',
          status: 'PENDING',
        },
      });
    });

    it('starts at order 1 when the chapter has no sections yet', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.aggregate.mockResolvedValue({ _max: { order: null } });

      await service.createSection('bab-1', { title: 'A', guidance: 'B' });

      expect(prisma.chapterSection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ order: 1 }) }),
      );
    });

    it('rejects when the chapter is locked', async () => {
      const { service } = makeService({ locked: true });
      await expect(
        service.createSection('bab-1', { title: 'A', guidance: 'B' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateSection', () => {
    it('resets status/content/error to PENDING when title or guidance changes', async () => {
      const { service, prisma } = makeService();
      await service.updateSection('bab-1', 'sec-1', { title: 'Judul baru' });

      expect(prisma.chapterSection.update).toHaveBeenCalledWith({
        where: { id: 'sec-1' },
        data: { title: 'Judul baru', status: 'PENDING', content: Prisma.DbNull, error: null },
      });
    });

    it('rejects when the section does not belong to this chapter', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue(null);

      await expect(service.updateSection('bab-1', 'sec-x', { title: 'A' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.chapterSection.update).not.toHaveBeenCalled();
    });

    it('rejects when the chapter is locked', async () => {
      const { service } = makeService({ locked: true });
      await expect(service.updateSection('bab-1', 'sec-1', { title: 'A' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('deleteSection', () => {
    it('deletes the section once ownership is confirmed', async () => {
      const { service, prisma } = makeService();
      await service.deleteSection('bab-1', 'sec-1');
      expect(prisma.chapterSection.delete).toHaveBeenCalledWith({ where: { id: 'sec-1' } });
    });

    it('rejects when the section does not belong to this chapter', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue(null);

      await expect(service.deleteSection('bab-1', 'sec-x')).rejects.toThrow(NotFoundException);
      expect(prisma.chapterSection.delete).not.toHaveBeenCalled();
    });
  });
});
