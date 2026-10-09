import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EvidenceKind, JobType, OwnerTipe, Role, StatusEkstraksi } from '@ai-led/db';
import { BuktiDukungService } from './bukti-dukung.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import type { JobsService } from '../jobs/jobs.service';
import type { StorageService } from '../storage/storage.service';

const FILE_KEY = 't1/uploads/00000000-0000-0000-0000-000000000000-bukti.txt';

function makeService(context: {
  tenantId: string;
  role: Role;
  studyProgramId: string | null;
}) {
  const prisma = {
    studyProgram: { findFirst: jest.fn() },
    evidenceFolder: { findFirst: jest.fn() },
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ fullName: 'Test User' }) },
    evidence: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
    },
    evidenceIndicatorTag: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    // remove() memutus baris penaut dulu (FK ON DELETE RESTRICT) di dalam
    // transaksi -- mock-nya menjalankan callback langsung dengan `prisma` itu
    // sendiri sebagai `tx`, jadi assertion tetap melihat pemanggilannya.
    evidenceDraftLink: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    evidenceChapterLink: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const tenantContext: Pick<
    TenantContextService,
    'getOrThrow' | 'runInManagedTransaction'
  > = {
    getOrThrow: jest.fn().mockReturnValue({ userId: 'u1', ...context }),
    runInManagedTransaction: jest.fn().mockImplementation((fn: () => unknown) => fn()),
  };
  const jobsService: Pick<JobsService, 'enqueue'> = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  };
  const storage: Pick<StorageService, 'headObject' | 'deleteObject'> = {
    headObject: jest.fn().mockResolvedValue({ sizeBytes: 123, contentType: 'text/plain' }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const service = new BuktiDukungService(
    prisma as never,
    tenantContext as TenantContextService,
    jobsService as JobsService,
    storage as StorageService,
  );
  return { service, prisma, jobsService, storage };
}

describe('BuktiDukungService.create', () => {
  it('rejects a fileKey that does not belong to the caller tenant', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    await expect(
      service.create({ ownerType: OwnerTipe.TENANT, fileKey: 'other-tenant/uploads/x.txt' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects PROGRAM_STUDI without studyProgramId', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    await expect(
      service.create({ ownerType: OwnerTipe.PROGRAM_STUDI, fileKey: FILE_KEY }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects TENANT with a studyProgramId set', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    await expect(
      service.create({ ownerType: OwnerTipe.TENANT, studyProgramId: 'p1', fileKey: FILE_KEY }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a PENYUSUN uploading at TENANT level', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    await expect(
      service.create({ ownerType: OwnerTipe.TENANT, fileKey: FILE_KEY }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a PENYUSUN uploading to a prodi that is not their own', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    await expect(
      service.create({ ownerType: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p2', fileKey: FILE_KEY }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a studyProgramId that does not belong to the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.studyProgram.findFirst.mockResolvedValue(null);
    await expect(
      service.create({ ownerType: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p1', fileKey: FILE_KEY }),
    ).rejects.toThrow(NotFoundException);
  });

  it('confirms the R2 object, creates the row, and enqueues INGESTION_BUKTI_DUKUNG', async () => {
    const { service, prisma, jobsService, storage } = makeService({
      tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null,
    });
    prisma.studyProgram.findFirst.mockResolvedValue({ id: 'p1' });

    const result = await service.create({
      ownerType: OwnerTipe.PROGRAM_STUDI,
      studyProgramId: 'p1',
      fileKey: FILE_KEY,
    });

    expect(storage.headObject).toHaveBeenCalledWith(FILE_KEY);
    expect(prisma.evidence.create).toHaveBeenCalled();
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      'INGESTION_BUKTI_DUKUNG',
      expect.objectContaining({ tenantId: 't1' }),
    );
    expect(result.fileUrl).toBe(FILE_KEY);
    expect(result.documentName).toBe('bukti.txt');
    expect(result.sizeBytes).toBe(123);
    expect(result.folderId).toBeNull();
  });

  it('rejects a folderId that does not belong to the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.evidenceFolder.findFirst.mockResolvedValue(null);
    await expect(
      service.create({ ownerType: OwnerTipe.TENANT, fileKey: FILE_KEY, folderId: 'fld-other-tenant' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a folderId from a different scope than the upload target', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.evidenceFolder.findFirst.mockResolvedValue({
      id: 'fld1', ownerType: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p1',
    });
    await expect(
      service.create({ ownerType: OwnerTipe.TENANT, fileKey: FILE_KEY, folderId: 'fld1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('stores a folderId that matches the upload scope', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.evidenceFolder.findFirst.mockResolvedValue({
      id: 'fld1', ownerType: OwnerTipe.TENANT, studyProgramId: null,
    });

    const result = await service.create({ ownerType: OwnerTipe.TENANT, fileKey: FILE_KEY, folderId: 'fld1' });
    expect(result.folderId).toBe('fld1');
  });

  it('bulk-creates EvidenceIndicatorTag rows scoped to accreditationSetId when indicatorNos is given', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });

    const result = await service.create({
      ownerType: OwnerTipe.TENANT,
      fileKey: FILE_KEY,
      indicatorNos: [3, 7],
      accreditationSetId: 'set-1',
    });

    expect(prisma.evidenceIndicatorTag.createMany).toHaveBeenCalledWith({
      data: [
        { evidenceId: result.id, accreditationSetId: 'set-1', indicatorNo: 3 },
        { evidenceId: result.id, accreditationSetId: 'set-1', indicatorNo: 7 },
      ],
      skipDuplicates: true,
    });
  });

  it('skips EvidenceIndicatorTag creation when indicatorNos is omitted', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });

    await service.create({ ownerType: OwnerTipe.TENANT, fileKey: FILE_KEY });

    expect(prisma.evidenceIndicatorTag.createMany).not.toHaveBeenCalled();
  });

  it('rejects indicatorNos without accreditationSetId', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });

    await expect(
      service.create({ ownerType: OwnerTipe.TENANT, fileKey: FILE_KEY, indicatorNos: [3] }),
    ).rejects.toThrow('accreditationSetId wajib diisi bila indicatorNos disertakan');
  });
});

describe('BuktiDukungService.findAll', () => {
  it('rejects a PENYUSUN listing tenant-level (no studyProgramId)', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    await expect(service.findAll(undefined)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a PENYUSUN listing a prodi that is not their own', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    await expect(service.findAll('p2')).rejects.toThrow(ForbiddenException);
  });

  it('allows PIMPINAN to list tenant-level', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    await service.findAll(undefined);
    expect(prisma.evidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', ownerType: OwnerTipe.TENANT, kind: EvidenceKind.BUKTI_DUKUNG } }),
    );
  });
});

describe('BuktiDukungService.remove', () => {
  it('throws NotFoundException when the row does not exist in the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.evidence.findFirst.mockResolvedValue(null);
    await expect(service.remove('b1')).rejects.toThrow(NotFoundException);
  });

  it('rejects a PENYUSUN deleting a bukti dukung uploaded by someone else', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.evidence.findFirst.mockResolvedValue({ id: 'b1', uploadedByUserId: 'someone-else', fileUrl: 'x' });
    await expect(service.remove('b1')).rejects.toThrow(ForbiddenException);
  });

  it('allows a PENYUSUN to delete their own upload', async () => {
    const { service, prisma, storage } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.evidence.findFirst.mockResolvedValue({ id: 'b1', uploadedByUserId: 'u1', fileUrl: 'x' });
    await service.remove('b1');
    expect(prisma.evidence.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(storage.deleteObject).toHaveBeenCalledWith('x');
  });

  /** Keduanya FK ON DELETE RESTRICT -- tanpa diputus dulu, delete selalu gagal P2003. */
  it('clears chapter/draft links before deleting the row', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.evidence.findFirst.mockResolvedValue({ id: 'b1', uploadedByUserId: 'u9', fileUrl: 'x' });
    await service.remove('b1');
    expect(prisma.evidenceDraftLink.deleteMany).toHaveBeenCalledWith({ where: { evidenceId: 'b1' } });
    expect(prisma.evidenceChapterLink.deleteMany).toHaveBeenCalledWith({ where: { evidenceId: 'b1' } });
  });
});

describe('BuktiDukungService.retryIngestion', () => {
  it('throws NotFoundException when the row does not exist in the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.evidence.findFirst.mockResolvedValue(null);
    await expect(service.retryIngestion('b1')).rejects.toThrow(NotFoundException);
  });

  it('rejects a PENYUSUN retrying a bukti dukung from a different prodi', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.evidence.findFirst.mockResolvedValue({
      id: 'b1', uploadedByUserId: 'someone-else', ownerType: OwnerTipe.PROGRAM_STUDI,
      studyProgramId: 'p2', extractionStatus: StatusEkstraksi.GAGAL,
    });
    await expect(service.retryIngestion('b1')).rejects.toThrow(ForbiddenException);
  });

  it('rejects a PENYUSUN retrying a TENANT-level bukti dukung', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.evidence.findFirst.mockResolvedValue({
      id: 'b1', uploadedByUserId: 'someone-else', ownerType: OwnerTipe.TENANT,
      studyProgramId: null, extractionStatus: StatusEkstraksi.GAGAL,
    });
    await expect(service.retryIngestion('b1')).rejects.toThrow(ForbiddenException);
  });

  it('allows a PENYUSUN to retry a bukti dukung from their own prodi even if uploaded by someone else', async () => {
    const { service, prisma, jobsService } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.evidence.findFirst.mockResolvedValue({
      id: 'b1', uploadedByUserId: 'someone-else', ownerType: OwnerTipe.PROGRAM_STUDI,
      studyProgramId: 'p1', extractionStatus: StatusEkstraksi.GAGAL, fileUrl: 'x', fileType: 'pdf',
    });
    await service.retryIngestion('b1');
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      'INGESTION_BUKTI_DUKUNG',
      expect.objectContaining({ buktiDukungId: 'b1' }),
    );
  });

  it('rejects retrying a row that is not GAGAL', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.evidence.findFirst.mockResolvedValue({
      id: 'b1', uploadedByUserId: 'u1', extractionStatus: StatusEkstraksi.SIAP,
    });
    await expect(service.retryIngestion('b1')).rejects.toThrow(BadRequestException);
  });

  it('resets a GAGAL row to MENUNGGU and re-enqueues INGESTION_BUKTI_DUKUNG', async () => {
    const { service, prisma, jobsService } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.evidence.findFirst.mockResolvedValue({
      id: 'b1',
      uploadedByUserId: 'u1',
      extractionStatus: StatusEkstraksi.GAGAL,
      fileUrl: 'x',
      fileType: 'pdf',
    });

    const result = await service.retryIngestion('b1');

    expect(prisma.evidence.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { extractionStatus: StatusEkstraksi.MENUNGGU, failureNote: null },
    });
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      'INGESTION_BUKTI_DUKUNG',
      { buktiDukungId: 'b1', tenantId: 't1', fileUrl: 'x', tipeFile: 'pdf' },
    );
    expect(result.extractionStatus).toBe(StatusEkstraksi.MENUNGGU);
  });
});

describe('BuktiDukungService — LKPS kind', () => {
  const LKPS_KEY = 't1/uploads/lkps-prodi.xlsx';

  it('indexes an LKPS right after upload with dimas INGESTION_LKPS (not as Bukti Dukung)', async () => {
    const { service, prisma, jobsService } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.studyProgram.findFirst.mockResolvedValue({ id: 'p1' });
    const row = await service.create({
      kind: EvidenceKind.LKPS, ownerType: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p1', fileKey: LKPS_KEY,
      documentName: 'LKPS TS 2024', period: '2023/2024',
    });
    expect(row).toMatchObject({
      kind: EvidenceKind.LKPS, extractionStatus: StatusEkstraksi.MENUNGGU,
      documentName: 'LKPS TS 2024', period: '2023/2024',
    });
    expect(jobsService.enqueue).toHaveBeenCalledTimes(1);
    expect(jobsService.enqueue).toHaveBeenCalledWith(JobType.INGESTION_LKPS, {
      evidenceId: row.id, tenantId: 't1', fileUrl: LKPS_KEY,
    });
  });

  it('requires a name and a year/period for a new LKPS', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.studyProgram.findFirst.mockResolvedValue({ id: 'p1' });
    const dasar = { kind: EvidenceKind.LKPS, ownerType: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p1', fileKey: LKPS_KEY };

    await expect(service.create({ ...dasar, period: '2024' })).rejects.toThrow('Nama LKPS wajib diisi');
    await expect(service.create({ ...dasar, documentName: '   ', period: '2024' })).rejects.toThrow('Nama LKPS wajib diisi');
    await expect(service.create({ ...dasar, documentName: 'LKPS' })).rejects.toThrow('Tahun/periode LKPS wajib diisi');
    await expect(service.create({ ...dasar, documentName: 'LKPS', period: '  ' })).rejects.toThrow('Tahun/periode LKPS wajib diisi');
  });

  it('never stores a period on a Bukti Dukung, even if the client sends one', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.studyProgram.findFirst.mockResolvedValue({ id: 'p1' });
    const row = await service.create({
      ownerType: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p1', fileKey: 't1/uploads/sk.pdf', period: '2024',
    });
    expect(row.period).toBeNull();
  });

  it('rejects a non-Excel LKPS and a tenant-level LKPS', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    await expect(
      service.create({ kind: EvidenceKind.LKPS, ownerType: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p1', fileKey: 't1/x.pdf' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create({ kind: EvidenceKind.LKPS, ownerType: OwnerTipe.TENANT, fileKey: LKPS_KEY }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lists only the requested kind (Bukti Dukung by default)', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    await service.findAll('p1');
    await service.findAll('p1', EvidenceKind.LKPS);
    expect(prisma.evidence.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', studyProgramId: 'p1', kind: EvidenceKind.BUKTI_DUKUNG });
    expect(prisma.evidence.findMany.mock.calls[1][0].where).toEqual({ tenantId: 't1', studyProgramId: 'p1', kind: EvidenceKind.LKPS });
  });
});
