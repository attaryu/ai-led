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
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'sec-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'sec-1' }),
      },
      documentChapter: {
        update: jest.fn().mockResolvedValue({ id: 'bab-1' }),
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

    it('does NOT recompile the chapter when only title/guidance change', async () => {
      const { service, prisma } = makeService();
      await service.updateSection('bab-1', 'sec-1', { title: 'Judul baru' });
      expect(prisma.documentChapter.update).not.toHaveBeenCalled();
    });

    it('writes content as GENERATED without resetting, and recompiles the chapter', async () => {
      const { service, prisma } = makeService();
      const content = { format: 'html', body: '<p>Isi ketikan langsung.</p>' };

      await service.updateSection('bab-1', 'sec-1', { content });

      expect(prisma.chapterSection.update).toHaveBeenCalledWith({
        where: { id: 'sec-1' },
        data: { status: 'GENERATED', content, generatedAt: expect.any(Date) },
      });
      expect(prisma.chapterSection.findMany).toHaveBeenCalledWith({
        where: { chapterId: 'bab-1', status: 'GENERATED' },
        orderBy: { order: 'asc' },
      });
      expect(prisma.documentChapter.update).toHaveBeenCalledWith({
        where: { id: 'bab-1' },
        data: { workingContent: expect.objectContaining({ format: 'html' }) },
      });
    });
  });

  describe('recompileChapterContent (via updateSection content write)', () => {
    it('joins every GENERATED section, skips ones without a body, in order', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findMany.mockResolvedValue([
        { title: 'Kebijakan', content: { body: '<p>Isi kebijakan.</p>', markdown: 'Isi kebijakan.' } },
        { title: 'Belum jadi', content: null },
        { title: 'Pelaksanaan', content: { body: '<p>Isi pelaksanaan.</p>' } },
      ]);

      await service.updateSection('bab-1', 'sec-1', { content: { format: 'html', body: '<p>x</p>' } });

      const { workingContent } = prisma.documentChapter.update.mock.calls[0][0].data;
      expect(workingContent.body).toBe('<h2>Kebijakan</h2><p>Isi kebijakan.</p><h2>Pelaksanaan</h2><p>Isi pelaksanaan.</p>');
      // Section tanpa `markdown` (ditulis langsung dari kanvas, bukan LLM) fallback ke `body` (HTML) apa adanya.
      expect(workingContent.markdown).toContain('<p>Isi pelaksanaan.</p>');
    });
  });

  describe('deleteSection', () => {
    it('deletes the section once ownership is confirmed', async () => {
      const { service, prisma } = makeService();
      await service.deleteSection('bab-1', 'sec-1');
      expect(prisma.chapterSection.delete).toHaveBeenCalledWith({ where: { id: 'sec-1' } });
    });

    it('recompiles the chapter after deleting, so the removed section drops out of workingContent', async () => {
      const { service, prisma } = makeService();
      await service.deleteSection('bab-1', 'sec-1');
      expect(prisma.documentChapter.update).toHaveBeenCalledWith({
        where: { id: 'bab-1' },
        data: { workingContent: expect.objectContaining({ format: 'html' }) },
      });
    });

    it('rejects when the section does not belong to this chapter', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue(null);

      await expect(service.deleteSection('bab-1', 'sec-x')).rejects.toThrow(NotFoundException);
      expect(prisma.chapterSection.delete).not.toHaveBeenCalled();
    });
  });
});
