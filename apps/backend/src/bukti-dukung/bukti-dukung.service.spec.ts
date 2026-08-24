import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnerTipe, Role } from '@ai-led/db';
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
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ fullName: 'Test User' }) },
    buktiDukung: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
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
      service.create({ ownerTipe: OwnerTipe.TENANT, fileKey: 'other-tenant/uploads/x.txt' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects PROGRAM_STUDI without studyProgramId', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    await expect(
      service.create({ ownerTipe: OwnerTipe.PROGRAM_STUDI, fileKey: FILE_KEY }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects TENANT with a studyProgramId set', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    await expect(
      service.create({ ownerTipe: OwnerTipe.TENANT, studyProgramId: 'p1', fileKey: FILE_KEY }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a PENYUSUN uploading at TENANT level', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    await expect(
      service.create({ ownerTipe: OwnerTipe.TENANT, fileKey: FILE_KEY }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a PENYUSUN uploading to a prodi that is not their own', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    await expect(
      service.create({ ownerTipe: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p2', fileKey: FILE_KEY }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a studyProgramId that does not belong to the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.studyProgram.findFirst.mockResolvedValue(null);
    await expect(
      service.create({ ownerTipe: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p1', fileKey: FILE_KEY }),
    ).rejects.toThrow(NotFoundException);
  });

  it('confirms the R2 object, creates the row, and enqueues INGESTION_BUKTI_DUKUNG', async () => {
    const { service, prisma, jobsService, storage } = makeService({
      tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null,
    });
    prisma.studyProgram.findFirst.mockResolvedValue({ id: 'p1' });

    const result = await service.create({
      ownerTipe: OwnerTipe.PROGRAM_STUDI,
      studyProgramId: 'p1',
      fileKey: FILE_KEY,
    });

    expect(storage.headObject).toHaveBeenCalledWith(FILE_KEY);
    expect(prisma.buktiDukung.create).toHaveBeenCalled();
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      'INGESTION_BUKTI_DUKUNG',
      expect.objectContaining({ tenantId: 't1' }),
    );
    expect(result.fileUrl).toBe(FILE_KEY);
    expect(result.namaDokumen).toBe('bukti.txt');
    expect(result.ukuranBytes).toBe(123);
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
    expect(prisma.buktiDukung.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', ownerTipe: OwnerTipe.TENANT } }),
    );
  });
});

describe('BuktiDukungService.remove', () => {
  it('throws NotFoundException when the row does not exist in the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, studyProgramId: null });
    prisma.buktiDukung.findFirst.mockResolvedValue(null);
    await expect(service.remove('b1')).rejects.toThrow(NotFoundException);
  });

  it('rejects a PENYUSUN deleting a bukti dukung uploaded by someone else', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.buktiDukung.findFirst.mockResolvedValue({ id: 'b1', diunggahOlehUserId: 'someone-else', fileUrl: 'x' });
    await expect(service.remove('b1')).rejects.toThrow(ForbiddenException);
  });

  it('allows a PENYUSUN to delete their own upload', async () => {
    const { service, prisma, storage } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.buktiDukung.findFirst.mockResolvedValue({ id: 'b1', diunggahOlehUserId: 'u1', fileUrl: 'x' });
    await service.remove('b1');
    expect(prisma.buktiDukung.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(storage.deleteObject).toHaveBeenCalledWith('x');
  });
});
