import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@ai-led/db';
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
        // Pilihan bukti dukung tersimpan; null = belum pernah disetel, pembacanya
        // jatuh ke evidence_draft_links seperti sebelumnya.
        findUnique: jest.fn().mockResolvedValue({ selectedEvidenceIds: null }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'sec-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'sec-1' }),
      },
      documentChapter: {
        update: jest.fn().mockResolvedValue({ id: 'bab-1' }),
      },
      // Ketikan kanvas menulis ke draft terpilih, atau MEMBUAT Draft 1 kalau
      // section belum punya -- supaya tidak ada kanvas berisi tanpa draft.
      sectionDraft: {
        update: jest.fn().mockResolvedValue({ id: 'draft-1' }),
        create: jest.fn().mockResolvedValue({ id: 'draft-baru' }),
        aggregate: jest.fn().mockResolvedValue({ _max: { version: null } }),
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ fullName: 'Test User' }),
      },
      generationRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'run-1' }),
      },
      evidenceDraftLink: {
        findMany: jest.fn().mockResolvedValue([{ evidenceId: 'ev-1' }]),
      },
      evidence: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) => Promise.resolve(where.id.in.map((id: string) => ({ id })))),
      },
      chapterDraft: {
        findFirst: jest.fn().mockResolvedValue({ id: 'draft-1' }),
      },
    };
    const access: Pick<BabAccessService, 'findOneScoped'> = {
      findOneScoped: jest.fn().mockResolvedValue({
        id: 'bab-1',
        locked: false,
        document: { studyProgramId: 'prodi-1' },
        ...babOverrides,
      }),
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

  describe('section edit guard on delete/generate', () => {
    it('deleteSection rejects a locked section', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue({ id: 'sec-1', locked: true });
      await expect(service.deleteSection('bab-1', 'sec-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.chapterSection.delete).not.toHaveBeenCalled();
    });

    it('triggerGenerate rejects a locked section', async () => {
      const { service, prisma, jobsService } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue({ id: 'sec-1', locked: true });
      await expect(service.triggerGenerate('bab-1', 'sec-1')).rejects.toThrow(ForbiddenException);
      expect(jobsService.enqueue).not.toHaveBeenCalled();
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

    it('rejects when the section is locked', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue({ id: 'sec-1', locked: true });
      await expect(service.updateSection('bab-1', 'sec-1', { title: 'A' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a PENYUSUN edit while the section awaits review', async () => {
      const { service, prisma, tenantContext } = makeService();
      tenantContext.getOrThrow.mockReturnValue({ tenantId: 't', userId: 'u', role: Role.PENYUSUN });
      prisma.chapterSection.findFirst.mockResolvedValue({ id: 'sec-1', reviewSubmittedAt: new Date() });
      await expect(service.updateSection('bab-1', 'sec-1', { title: 'A' })).rejects.toThrow(
        ForbiddenException,
      );
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
      const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Isi ketikan langsung.' }] }] };

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
        data: { workingContent: expect.objectContaining({ type: 'doc' }) },
      });
    });
  });

  describe('recompileChapterContent (via updateSection content write)', () => {
    it('joins every GENERATED section as heading + doc nodes, skips ones without content, in order', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findMany.mockResolvedValue([
        {
          id: 's1',
          parentId: null,
          status: 'GENERATED',
          title: 'Kebijakan',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Isi kebijakan.' }] }] },
        },
        { id: 's2', parentId: null, status: 'PENDING', title: 'Belum jadi', content: null },
        {
          id: 's3',
          parentId: null,
          status: 'GENERATED',
          title: 'Pelaksanaan',
          content: { format: 'html', body: '<p>Isi pelaksanaan.</p>' },
        },
      ]);

      await service.updateSection('bab-1', 'sec-1', { content: { format: 'html', body: '<p>x</p>' } });

      const { workingContent } = prisma.documentChapter.update.mock.calls[0][0].data;
      expect(workingContent.type).toBe('doc');
      expect(workingContent.content.map((n: { type: string }) => n.type)).toEqual([
        'heading',
        'paragraph',
        'heading',
        'paragraph',
      ]);
      // Baris lama ({format:'html', body}) turun jadi satu paragraf teks.
      expect(workingContent.content[3].content[0].text).toBe('Isi pelaksanaan.');
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
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Isi VMTS.' }] }] },
        },
      ]);

      await service.updateSection('bab-1', 'sec-1', { content: { format: 'html', body: '<p>x</p>' } });

      const { workingContent } = prisma.documentChapter.update.mock.calls[0][0].data;
      expect(workingContent.content[0]).toEqual({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Diferensiasi Misi' }],
      });
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
        data: { workingContent: expect.objectContaining({ type: 'doc' }) },
      });
    });

    it('rejects when the section does not belong to this chapter', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue(null);

      await expect(service.deleteSection('bab-1', 'sec-x')).rejects.toThrow(NotFoundException);
      expect(prisma.chapterSection.delete).not.toHaveBeenCalled();
    });
  });

  describe('triggerEvaluasiRagas', () => {
    const sectionIsi = {
      id: 'sec-1',
      chapterId: 'bab-1',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Narasi.' }] }] },
    };

    it('menandai run pending lalu memasukkan job PENILAIAN_RAGAS', async () => {
      const { service, prisma, jobsService } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue(sectionIsi);
      prisma.generationRun.findFirst.mockResolvedValue({ id: 'run-1', judgeResult: null });

      await service.triggerEvaluasiRagas('bab-1', 'sec-1');

      expect(prisma.generationRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: { judgeResult: expect.objectContaining({ pending: true, engine: 'ragas' }) },
        }),
      );
      expect(jobsService.enqueue).toHaveBeenCalledWith(
        'PENILAIAN_RAGAS',
        expect.objectContaining({ babDokumenId: 'bab-1', sectionId: 'sec-1', runId: 'run-1', tenantId: 'tenant-1' }),
      );
    });

    it('menolak section yang belum pernah digenerate', async () => {
      const { service, prisma, jobsService } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue(sectionIsi);
      prisma.generationRun.findFirst.mockResolvedValue(null);

      await expect(service.triggerEvaluasiRagas('bab-1', 'sec-1')).rejects.toThrow('belum pernah digenerate');
      expect(jobsService.enqueue).not.toHaveBeenCalled();
    });

    it('menolak section kosong', async () => {
      const { service, prisma, jobsService } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue({ id: 'sec-1', chapterId: 'bab-1', content: null });
      prisma.generationRun.findFirst.mockResolvedValue({ id: 'run-1', judgeResult: null });

      await expect(service.triggerEvaluasiRagas('bab-1', 'sec-1')).rejects.toThrow('masih kosong');
      expect(jobsService.enqueue).not.toHaveBeenCalled();
    });

    it('menolak klik ganda saat penilaian masih berjalan, tapi mengizinkan pending yang sudah macet', async () => {
      const { service, prisma, jobsService } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue(sectionIsi);

      prisma.generationRun.findFirst.mockResolvedValue({
        id: 'run-1',
        judgeResult: { pending: true, startedAt: new Date().toISOString() },
      });
      await expect(service.triggerEvaluasiRagas('bab-1', 'sec-1')).rejects.toThrow('sedang berjalan');
      expect(jobsService.enqueue).not.toHaveBeenCalled();

      prisma.generationRun.findFirst.mockResolvedValue({
        id: 'run-1',
        judgeResult: { pending: true, startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
      });
      await service.triggerEvaluasiRagas('bab-1', 'sec-1');
      expect(jobsService.enqueue).toHaveBeenCalledTimes(1);
    });

    it('menolak bab yang terkunci review', async () => {
      const { service, jobsService } = makeService({ locked: true });
      await expect(service.triggerEvaluasiRagas('bab-1', 'sec-1')).rejects.toThrow(ForbiddenException);
      expect(jobsService.enqueue).not.toHaveBeenCalled();
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

    it("rejects evidence outside this tenant or this chapter's prodi", async () => {
      const { service, prisma, jobsService } = makeService();
      prisma.evidence.findMany.mockResolvedValue([{ id: 'ev-1' }]);
      await expect(
        service.triggerGenerate('bab-1', 'sec-1', undefined, undefined, ['ev-1', 'ev-other']),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.evidence.findMany.mock.calls[0][0].where).toMatchObject({
        tenantId: 'tenant-1',
        OR: [{ studyProgramId: 'prodi-1' }, { studyProgramId: null }],
      });
      expect(jobsService.enqueue).not.toHaveBeenCalled();
    });

    it("rejects a draftId from another chapter", async () => {
      const { service, prisma } = makeService();
      prisma.chapterDraft.findFirst.mockResolvedValue(null);
      await expect(service.triggerGenerate('bab-1', 'sec-1', undefined, 'draft-x')).rejects.toThrow(NotFoundException);
    });

    it('rejects when the chapter is locked', async () => {
      const { service } = makeService({ locked: true });
      await expect(service.triggerGenerate('bab-1', 'sec-1')).rejects.toThrow(ForbiddenException);
    });
  });

  /** Tidak boleh ada keadaan "kanvas berisi tapi Riwayat Draft kosong". */
  describe('updateSection content -> draft', () => {
    it('creates Draft 1 when the section has none yet', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        chapterId: 'bab-1',
        activeCheckpointId: null,
      });
      await service.updateSection('bab-1', 'sec-1', {
        content: { type: 'doc', content: [] },
      } as never);
      expect(prisma.sectionDraft.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 1, source: 'MANUAL' }) }),
      );
      expect(prisma.chapterSection.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activeCheckpointId: 'draft-baru' } }),
      );
    });

    it('writes into the selected draft when one exists', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        chapterId: 'bab-1',
        activeCheckpointId: 'draft-1',
      });
      await service.updateSection('bab-1', 'sec-1', {
        content: { type: 'doc', content: [] },
      } as never);
      expect(prisma.sectionDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'draft-1' } }),
      );
      expect(prisma.sectionDraft.create).not.toHaveBeenCalled();
    });
  });

  describe('findSourcesForSection', () => {
    it('returns the latest run\'s chunksUsed for this section', async () => {
      const { service, prisma } = makeService();
      const generatedAt = new Date('2026-09-04T00:00:00Z');
      prisma.generationRun.findFirst.mockResolvedValue({
        chunksUsed: [{ citation_label: 'LED hal. 3', text: 'Teks.' }],
        createdAt: generatedAt,
      });

      const result = await service.findSourcesForSection('bab-1', 'sec-1');

      expect(prisma.generationRun.findFirst).toHaveBeenCalledWith({
        where: { sectionId: 'sec-1' },
        orderBy: { createdAt: 'desc' },
        select: {
          chunksUsed: true,
          createdAt: true,
          chapterDraftId: true,
          judgeResult: true,
          latencySec: true,
          model: true,
          checklist: true,
          checklistError: true,
        },
      });
      expect(result).toEqual({
        chunksUsed: [{ citation_label: 'LED hal. 3', text: 'Teks.', fileUrl: null }],
        generatedAt,
        selectedEvidenceIds: ['ev-1'],
        judgeResult: undefined,
        latencySec: undefined,
        model: undefined,
        checklist: [],
        checklistError: undefined,
      });
    });

    it("resolves fileUrl for 'evidence' chunks via bukti_dukung_id, null for 'led' chunks", async () => {
      const { service, prisma } = makeService();
      const generatedAt = new Date('2026-09-04T00:00:00Z');
      prisma.generationRun.findFirst.mockResolvedValue({
        chunksUsed: [
          { citation_label: 'LED hal. 3', kind: 'led', text: 'Teks LED.' },
          { citation_label: 'SK Rektor.pdf', kind: 'evidence', text: 'Teks evidence.', bukti_dukung_id: 'ev-1' },
        ],
        createdAt: generatedAt,
      });
      prisma.evidence.findMany.mockResolvedValue([{ id: 'ev-1', fileUrl: 'tenant-1/uploads/sk-rektor.pdf' }]);

      const result = await service.findSourcesForSection('bab-1', 'sec-1');

      expect(prisma.evidence.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['ev-1'] } },
        select: { id: true, fileUrl: true },
      });
      expect(result).toEqual({
        chunksUsed: [
          { citation_label: 'LED hal. 3', kind: 'led', text: 'Teks LED.', fileUrl: null },
          {
            citation_label: 'SK Rektor.pdf',
            kind: 'evidence',
            text: 'Teks evidence.',
            bukti_dukung_id: 'ev-1',
            fileUrl: 'tenant-1/uploads/sk-rektor.pdf',
          },
        ],
        generatedAt,
        selectedEvidenceIds: ['ev-1'],
        judgeResult: undefined,
        latencySec: undefined,
        model: undefined,
        checklist: [],
        checklistError: undefined,
      });
    });

    it('returns null (not an empty array) when the section was never generated via this job', async () => {
      const { service, prisma } = makeService();
      prisma.generationRun.findFirst.mockResolvedValue(null);

      const result = await service.findSourcesForSection('bab-1', 'sec-1');

      expect(result).toBeNull();
    });

    it('rejects when the section does not belong to this chapter', async () => {
      const { service, prisma } = makeService();
      prisma.chapterSection.findFirst.mockResolvedValue(null);

      await expect(service.findSourcesForSection('bab-1', 'sec-other')).rejects.toThrow(NotFoundException);
      expect(prisma.generationRun.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('findRecommendation', () => {
    it('without draftId returns the latest recommended-or-confirmed row, so a pending one survives a refresh (dimas)', async () => {
      const { service, prisma } = makeService();
      const findFirst = jest.fn().mockResolvedValue({ id: 'rec-1', status: 'DIREKOMENDASIKAN' });
      Object.assign(prisma, { documentRecommendation: { findFirst } });

      await expect(service.findRecommendation('bab-1', undefined, 'sec-1')).resolves.toEqual({
        id: 'rec-1',
        status: 'DIREKOMENDASIKAN',
      });
      expect(findFirst.mock.calls[0][0].where).toEqual({
        status: { in: ['DIREKOMENDASIKAN', 'DIKONFIRMASI'] },
        chapterDraft: { chapterId: 'bab-1' },
        chapterSectionId: 'sec-1',
      });
    });
  });
});
