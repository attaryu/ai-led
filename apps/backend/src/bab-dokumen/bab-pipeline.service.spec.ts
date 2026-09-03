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
    const tenantContext = {
      getOrThrow: jest.fn().mockReturnValue({ tenantId: 'tenant-1', userId: 'user-1' }),
    };
    const jobsService = { enqueue: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const service = new BabPipelineService(
      prisma as never,
      tenantContext as never,
      jobsService as never,
      access as BabAccessService,
    );
    return { service, prisma, access, tenantContext, jobsService };
  }

  describe('createSection', () => {
    it('appends at max(order)+1 with status PENDING', async () => {
      const { service, prisma } = makeService();
      await service.createSection('bab-1', { title: 'Kebijakan', guidance: 'Bahas dasar hukum' });

      expect(prisma.chapterSection.create).toHaveBeenCalledWith({
        data: {
          chapterId: 'bab-1',
          parentId: null,
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

    it('nests under parentId, ordering among siblings of that parent (not global)', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue({ id: 'top-1', chapterId: 'bab-1', parentId: null });

      await service.createSection('bab-1', { title: 'C.1', guidance: 'B', parentId: 'top-1' });

      expect(prisma.chapterSection.aggregate).toHaveBeenCalledWith({
        where: { chapterId: 'bab-1', parentId: 'top-1' },
        _max: { order: true },
      });
      expect(prisma.chapterSection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ parentId: 'top-1' }) }),
      );
    });

    it('rejects nesting under a section that is already a sub-sub-bab (max one level deep)', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue({ id: 'child-1', chapterId: 'bab-1', parentId: 'top-1' });

      await expect(
        service.createSection('bab-1', { title: 'X', guidance: 'B', parentId: 'child-1' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.chapterSection.create).not.toHaveBeenCalled();
    });

    it('rejects when parentId does not belong to this chapter', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue(null);

      await expect(
        service.createSection('bab-1', { title: 'X', guidance: 'B', parentId: 'not-here' }),
      ).rejects.toThrow(NotFoundException);
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
        where: { chapterId: 'bab-1' },
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
        {
          id: 's1',
          parentId: null,
          status: 'GENERATED',
          title: 'Kebijakan',
          content: { body: '<p>Isi kebijakan.</p>', markdown: 'Isi kebijakan.' },
        },
        { id: 's2', parentId: null, status: 'PENDING', title: 'Belum jadi', content: null },
        {
          id: 's3',
          parentId: null,
          status: 'GENERATED',
          title: 'Pelaksanaan',
          content: { body: '<p>Isi pelaksanaan.</p>' },
        },
      ]);

      await service.updateSection('bab-1', 'sec-1', { content: { format: 'html', body: '<p>x</p>' } });

      const { workingContent } = prisma.documentChapter.update.mock.calls[0][0].data;
      expect(workingContent.body).toBe('<h2>Kebijakan</h2><p>Isi kebijakan.</p><h2>Pelaksanaan</h2><p>Isi pelaksanaan.</p>');
      // Section tanpa `markdown` (ditulis langsung dari kanvas, bukan LLM) fallback ke `body` (HTML) apa adanya.
      expect(workingContent.markdown).toContain('<p>Isi pelaksanaan.</p>');
    });

    it('renders a child (parentId set) as h3 nested under its parent, not flattened to h2', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findMany.mockResolvedValue([
        { id: 'top', parentId: null, status: 'PENDING', title: 'Kriteria Akreditasi', content: null },
        {
          id: 'child',
          parentId: 'top',
          status: 'GENERATED',
          title: 'Diferensiasi Misi',
          content: { body: '<p>Isi VMTS.</p>', markdown: 'Isi VMTS.' },
        },
      ]);

      await service.updateSection('bab-1', 'sec-1', { content: { format: 'html', body: '<p>x</p>' } });

      const { workingContent } = prisma.documentChapter.update.mock.calls[0][0].data;
      expect(workingContent.body).toBe('<h3>Diferensiasi Misi</h3><p>Isi VMTS.</p>');
      expect(workingContent.markdown).toContain('### Diferensiasi Misi');
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

  describe('triggerGenerate', () => {
    it('passes selectedEvidenceIds through to the job when no draftId is given', async () => {
      const { service, jobsService } = makeService();
      await service.triggerGenerate('bab-1', 'sec-1', undefined, undefined, ['ev-1', 'ev-2']);

      expect(jobsService.enqueue).toHaveBeenCalledWith(
        'GENERASI_BAB',
        expect.objectContaining({ selectedEvidenceIds: ['ev-1', 'ev-2'] }),
      );
    });

    it('omits selectedEvidenceIds from the job when the list is empty', async () => {
      const { service, jobsService } = makeService();
      await service.triggerGenerate('bab-1', 'sec-1', undefined, undefined, []);

      const [, data] = jobsService.enqueue.mock.calls[0];
      expect(data).not.toHaveProperty('selectedEvidenceIds');
    });

    it('still passes draftId through untouched alongside selectedEvidenceIds', async () => {
      const { service, jobsService } = makeService();
      await service.triggerGenerate('bab-1', 'sec-1', undefined, 'draft-1', ['ev-1']);

      expect(jobsService.enqueue).toHaveBeenCalledWith(
        'GENERASI_BAB',
        expect.objectContaining({ draftId: 'draft-1', selectedEvidenceIds: ['ev-1'] }),
      );
    });

    it('rejects when the chapter is locked', async () => {
      const { service } = makeService({ locked: true });
      await expect(service.triggerGenerate('bab-1', 'sec-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
