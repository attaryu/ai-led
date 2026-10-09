import { JobType, Role } from '@ai-led/db';
import { DokumenLedService } from './dokumen-led.service';
import type { JobsService } from '../jobs/jobs.service';
import type { TenantContextService } from '../tenant/tenant-context.service';

function makeService(context: {
  tenantId: string;
  role: Role;
  studyProgramId: string | null;
}) {
  const findMany = jest.fn().mockResolvedValue([]);
  const findFirst = jest.fn().mockResolvedValue(null);
  const count = jest.fn().mockResolvedValue(0);
  const deleteOne = jest.fn().mockResolvedValue(undefined);
  const deleteManyVerdict = jest.fn().mockResolvedValue({ count: 0 });
  const deleteManySession = jest.fn().mockResolvedValue({ count: 0 });
  const deleteManyChunk = jest.fn().mockResolvedValue({ count: 0 });
  const emptyFindMany = jest.fn().mockResolvedValue([]);
  const noopDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const noopUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
  const setFindFirst = jest.fn().mockResolvedValue(null);
  const evidenceFindFirst = jest.fn().mockResolvedValue(null);
  const update = jest.fn().mockImplementation(({ data }) => Promise.resolve(data));
  const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'baru', ...data }));
  const studyProgramFindFirst = jest.fn().mockResolvedValue({ id: 'p1' });
  const prisma = {
    studyProgram: { findFirst: studyProgramFindFirst },
    ledDocument: { findMany, findFirst, delete: deleteOne, update, create },
    accreditationSet: { findFirst: setFindFirst },
    evidence: { findFirst: evidenceFindFirst },
    documentChapter: { count, findMany: emptyFindMany, updateMany: noopUpdateMany, deleteMany: noopDeleteMany },
    chapterDraft: { findMany: emptyFindMany, deleteMany: noopDeleteMany },
    chapterSection: { findMany: emptyFindMany, updateMany: noopUpdateMany },
    evalResult: { deleteMany: noopDeleteMany },
    generationRun: { deleteMany: noopDeleteMany },
    evidenceDraftLink: { deleteMany: noopDeleteMany },
    criterionScoreResult: { deleteMany: noopDeleteMany },
    ragasScore: { deleteMany: noopDeleteMany },
    chatMessage: { deleteMany: noopDeleteMany },
    evidenceChapterLink: { deleteMany: noopDeleteMany },
    assessmentVerdict: { deleteMany: deleteManyVerdict },
    assessmentSession: { deleteMany: deleteManySession },
    ledChunkEmbedding: { deleteMany: deleteManyChunk },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
  const transaction = jest.fn().mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma));
  (prisma as typeof prisma & { $transaction: typeof transaction }).$transaction = transaction;
  const tenantContext: Pick<TenantContextService, 'getOrThrow' | 'runInManagedTransaction'> = {
    getOrThrow: jest.fn().mockReturnValue({ userId: 'u1', ...context }),
    runInManagedTransaction: jest.fn().mockImplementation((cb: () => Promise<unknown>) => cb()),
  };
  const jobsService: Pick<JobsService, 'enqueue'> = {
    enqueue: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };
  const service = new DokumenLedService(
    prisma as never,
    tenantContext as TenantContextService,
    jobsService as JobsService,
  );
  return {
    service,
    findMany,
    findFirst,
    count,
    deleteOne,
    deleteManyVerdict,
    deleteManySession,
    deleteManyChunk,
    transaction,
    jobsService,
    setFindFirst,
    evidenceFindFirst,
    update,
    create,
  };
}

describe('DokumenLedService.findAllForTenant', () => {
  it('returns an empty list for a PENYUSUN with no assigned prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PENYUSUN,
      studyProgramId: null,
    });

    await expect(service.findAllForTenant()).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('scopes a PENYUSUN to their own prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PENYUSUN,
      studyProgramId: 'prodi-1',
    });

    await service.findAllForTenant();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studyProgram: { tenantId: 't1' },
          studyProgramId: 'prodi-1',
        }) as unknown,
      }),
    );
  });

  it('does not scope PIMPINAN/PENJAMIN_MUTU/ADMIN to any single prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PIMPINAN,
      studyProgramId: null,
    });

    await service.findAllForTenant();
    const call = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('studyProgramId');
  });
});

describe('DokumenLedService.triggerAssessment', () => {
  it('enqueues an ASSESSMENT_AMI job with correct payload when document exists', async () => {
    const { service, findFirst, jobsService } = makeService({
      tenantId: 't1',
      role: Role.PENJAMIN_MUTU,
      studyProgramId: null,
    });

    findFirst.mockResolvedValue({
      id: 'doc-123',
      studyProgramId: 'prodi-1',
    });

    const res = await service.triggerAssessment('doc-123', {
      indikatorList: [1, 2],
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-123', studyProgram: { tenantId: 't1' } },
    });
    expect(jobsService.enqueue).toHaveBeenCalledWith(JobType.ASSESSMENT_AMI, {
      dokumenId: 'doc-123',
      tenantId: 't1',
      // BullMQ job payload key stays `programStudiId` — cross-service contract
      // with apps/ai's worker, not renamed alongside the Prisma field.
      programStudiId: 'prodi-1',
      createdByUserId: 'u1',
      indikatorList: [1, 2],
    });
    expect(res).toEqual({ id: 'job-1' });
  });

  it('omits indikatorList (not []) when unspecified, so it reads as "assess all" downstream', async () => {
    const { service, findFirst, jobsService } = makeService({
      tenantId: 't1',
      role: Role.PENJAMIN_MUTU,
      studyProgramId: null,
    });

    findFirst.mockResolvedValue({ id: 'doc-123', studyProgramId: 'prodi-1' });

    await service.triggerAssessment('doc-123');

    const payload = (jobsService.enqueue as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.indikatorList).toBeUndefined();
  });

  it('throws NotFoundException if document does not exist for tenant', async () => {
    const { service, findFirst } = makeService({
      tenantId: 't1',
      role: Role.PENJAMIN_MUTU,
      studyProgramId: null,
    });

    findFirst.mockResolvedValue(null);

    await expect(
      service.triggerAssessment('invalid-id'),
    ).rejects.toThrow('Dokumen LED tidak ditemukan');
  });
});

describe('DokumenLedService.remove', () => {
  it('cascades chapters, sections, drafts, chat, assessment sessions/verdicts and LED chunk embeddings in one transaction', async () => {
    const { service, findFirst, count, deleteManyVerdict, deleteManySession, deleteManyChunk, deleteOne, transaction } =
      makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    findFirst.mockResolvedValue({ id: 'doc-123', studyProgramId: 'prodi-1' });
    count.mockResolvedValue(0);

    await service.remove('doc-123');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteManyVerdict).toHaveBeenCalledWith({ where: { documentId: 'doc-123' } });
    expect(deleteManySession).toHaveBeenCalledWith({ where: { documentId: 'doc-123' } });
    expect(deleteManyChunk).toHaveBeenCalledWith({ where: { documentId: 'doc-123' } });
    expect(deleteOne).toHaveBeenCalledWith({ where: { id: 'doc-123' } });
  });
});

describe('DokumenLedService.update', () => {
  const ctx = { tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null };
  const doc = { id: 'd1', studyProgramId: 'p1', accreditationSetId: null, lkpsEvidenceId: null };

  it('rejects an accreditation set from another tenant (or missing)', async () => {
    const m = makeService(ctx);
    m.findFirst.mockResolvedValue(doc);
    await expect(m.service.update('d1', { accreditationSetId: 'other' })).rejects.toThrow('tidak ditemukan');
    expect(m.setFindFirst.mock.calls[0][0].where).toEqual({ id: 'other', tenantId: 't1' });
    expect(m.update).not.toHaveBeenCalled();
  });

  it('rejects a DRAF accreditation set', async () => {
    const m = makeService(ctx);
    m.findFirst.mockResolvedValue(doc);
    m.setFindFirst.mockResolvedValue({ status: 'DRAF' });
    await expect(m.service.update('d1', { accreditationSetId: 's1' })).rejects.toThrow('DRAF');
  });

  it('accepts only an LKPS file of the same prodi, without re-indexing (indexed once on upload)', async () => {
    const m = makeService(ctx);
    m.findFirst.mockResolvedValue(doc);
    m.evidenceFindFirst.mockResolvedValue({ id: 'ev1' });
    await m.service.update('d1', { lkpsEvidenceId: 'ev1' });
    expect(m.evidenceFindFirst.mock.calls[0][0].where).toEqual({ id: 'ev1', studyProgramId: 'p1', kind: 'LKPS' });
    expect(m.jobsService.enqueue).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalled();
  });
});

describe('DokumenLedService.confirmLedUpload', () => {
  it('stores the file key and enqueues INGESTION_LED instead of forwarding the file', async () => {
    const m = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    m.findFirst.mockResolvedValue({ id: 'd1', studyProgramId: 'p1' });
    await m.service.confirmLedUpload('d1', { fileKey: 't1/abc/led.pdf' });
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { ledFileKey: 't1/abc/led.pdf' } });
    expect(m.jobsService.enqueue).toHaveBeenCalledWith(JobType.INGESTION_LED, {
      dokumenId: 'd1',
      tenantId: 't1',
      fileUrl: 't1/abc/led.pdf',
    });
  });

  it("rejects another tenant's file key", async () => {
    const m = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    m.findFirst.mockResolvedValue({ id: 'd1', studyProgramId: 'p1' });
    await expect(m.service.confirmLedUpload('d1', { fileKey: 't2/led.pdf' })).rejects.toThrow('tenant');
    expect(m.jobsService.enqueue).not.toHaveBeenCalled();
  });
});

describe('DokumenLedService.triggerAssessment — document LKPS fallback', () => {
  const ctx = { tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' };

  it("adopts the assessment's LKPS as the document LKPS when none is set", async () => {
    const m = makeService(ctx);
    m.findFirst.mockResolvedValue({ id: 'd1', studyProgramId: 'p1', lkpsEvidenceId: null });
    m.evidenceFindFirst.mockResolvedValue({ fileUrl: 't1/lkps.xlsx' });
    await m.service.triggerAssessment('d1', { lkpsBuktiDukungId: 'ev1' });
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { lkpsEvidenceId: 'ev1' } });
    expect(m.jobsService.enqueue).toHaveBeenCalledTimes(1); // only ASSESSMENT_AMI -- the LKPS is already indexed
  });

  it('leaves an existing document LKPS untouched', async () => {
    const m = makeService(ctx);
    m.findFirst.mockResolvedValue({ id: 'd1', studyProgramId: 'p1', lkpsEvidenceId: 'ev-old' });
    await m.service.triggerAssessment('d1', { lkpsBuktiDukungId: 'ev1' });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.jobsService.enqueue).toHaveBeenCalledTimes(1); // only ASSESSMENT_AMI
  });
});

describe('DokumenLedService.create — LKPS pilihan', () => {
  const ctx = { tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null };
  const dasar = { title: 'LED TI 2026', academicYear: '2025/2026', deadline: '2026-12-31', accreditationSetId: 'set1' };

  it('menyimpan LKPS yang dipilih bila LKPS itu milik prodi yang sama', async () => {
    const m = makeService(ctx);
    m.setFindFirst.mockResolvedValue({ status: 'SIAP' });
    m.evidenceFindFirst.mockResolvedValue({ id: 'ev1' });
    const hasil = await m.service.create('p1', { ...dasar, lkpsEvidenceId: 'ev1' });
    // LKPS harus berjenis LKPS dan milik prodi dokumen ini -- bukan LKPS prodi lain
    expect(m.evidenceFindFirst.mock.calls[0][0].where).toEqual({ id: 'ev1', studyProgramId: 'p1', kind: 'LKPS' });
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(hasil).toMatchObject({ studyProgramId: 'p1', lkpsEvidenceId: 'ev1' });
  });

  it('menolak LKPS milik prodi lain dan tidak membuat dokumen', async () => {
    const m = makeService(ctx);
    m.setFindFirst.mockResolvedValue({ status: 'SIAP' });
    m.evidenceFindFirst.mockResolvedValue(null);
    await expect(m.service.create('p1', { ...dasar, lkpsEvidenceId: 'milik-prodi-lain' })).rejects.toThrow(
      'LKPS prodi ini',
    );
    expect(m.create).not.toHaveBeenCalled();
  });

  it('tanpa LKPS ditolak dan tidak membuat dokumen (wajib)', async () => {
    const m = makeService(ctx);
    m.setFindFirst.mockResolvedValue({ status: 'SIAP' });
    await expect(m.service.create('p1', dasar)).rejects.toThrow('LKPS wajib dipilih');
    expect(m.evidenceFindFirst).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
});

describe('DokumenLedService.triggerAssessment — LKPS dokumen menang', () => {
  const ctx = { tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' };
  const payload = (m: ReturnType<typeof makeService>) =>
    (m.jobsService.enqueue as jest.Mock).mock.calls[0][1] as { lkpsBuktiDukungId?: string };

  it('memakai LKPS milik dokumen walau klien mengirim LKPS lain', async () => {
    const m = makeService(ctx);
    m.findFirst.mockResolvedValue({ id: 'd1', studyProgramId: 'p1', lkpsEvidenceId: 'ev-dokumen' });
    await m.service.triggerAssessment('d1', { lkpsBuktiDukungId: 'ev-lain' });
    expect(payload(m).lkpsBuktiDukungId).toBe('ev-dokumen');
  });

  it('memakai LKPS dokumen walau klien tidak mengirim apa pun', async () => {
    const m = makeService(ctx);
    m.findFirst.mockResolvedValue({ id: 'd1', studyProgramId: 'p1', lkpsEvidenceId: 'ev-dokumen' });
    await m.service.triggerAssessment('d1');
    expect(payload(m).lkpsBuktiDukungId).toBe('ev-dokumen');
  });

  it('dokumen tanpa LKPS: kiriman klien dipakai (dan jadi LKPS dokumen)', async () => {
    const m = makeService(ctx);
    m.findFirst.mockResolvedValue({ id: 'd1', studyProgramId: 'p1', lkpsEvidenceId: null });
    m.evidenceFindFirst.mockResolvedValue({ id: 'ev1' });
    await m.service.triggerAssessment('d1', { lkpsBuktiDukungId: 'ev1' });
    expect(payload(m).lkpsBuktiDukungId).toBe('ev1');
  });
});

describe('DokumenLedService.triggerAssessment — pilihan per sub-indikator', () => {
  const ctx = { tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' };
  const payload = (m: ReturnType<typeof makeService>) =>
    (m.jobsService.enqueue as jest.Mock).mock.calls[0][1] as { indikatorList?: number[]; subIndikatorList?: string[] };

  it('meneruskan subIndikatorList (43|I tanpa 43|II) ke worker', async () => {
    const m = makeService(ctx);
    m.findFirst.mockResolvedValue({ id: 'd1', studyProgramId: 'p1', lkpsEvidenceId: 'ev1' });
    await m.service.triggerAssessment('d1', { indikatorList: [43], subIndikatorList: ['43|I'] });
    expect(payload(m).subIndikatorList).toEqual(['43|I']);
    expect(payload(m).indikatorList).toEqual([43]);
  });

  it('tanpa subIndikatorList, payload tidak membawa kunci itu (perilaku lama)', async () => {
    const m = makeService(ctx);
    m.findFirst.mockResolvedValue({ id: 'd1', studyProgramId: 'p1', lkpsEvidenceId: 'ev1' });
    await m.service.triggerAssessment('d1', { indikatorList: [1] });
    expect(payload(m)).not.toHaveProperty('subIndikatorList');
  });
});
