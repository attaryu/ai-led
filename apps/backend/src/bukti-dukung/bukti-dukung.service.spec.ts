import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnerTipe, Role, StatusEkstraksi } from '@ai-led/db';
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
  };
  const tenantContext: Pick<TenantContextService, 'getOrThrow'> = {
    getOrThrow: jest.fn().mockReturnValue({ userId: 'u1', ...context }),
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
      expect.objectContaining({ where: { tenantId: 't1', ownerType: OwnerTipe.TENANT } }),
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
