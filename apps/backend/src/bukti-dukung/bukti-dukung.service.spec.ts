import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnerTipe, Role } from '@ai-led/db';
import { BuktiDukungService } from './bukti-dukung.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import type { JobsService } from '../jobs/jobs.service';
import * as storage from './bukti-dukung.storage';

jest.mock('./bukti-dukung.storage', () => ({
  saveBuktiDukungFile: jest.fn().mockResolvedValue('t1/tenant/bukti.txt'),
  deleteBuktiDukungFile: jest.fn().mockResolvedValue(undefined),
}));

const FILE = { originalname: 'bukti.txt', size: 123, buffer: Buffer.from('x') } as Express.Multer.File;

function makeService(context: {
  tenantId: string;
  role: Role;
  programStudiId: string | null;
}) {
  const prisma = {
    programStudi: { findFirst: jest.fn() },
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ namaLengkap: 'Test User' }) },
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
  const service = new BuktiDukungService(
    prisma as never,
    tenantContext as TenantContextService,
    jobsService as JobsService,
  );
  return { service, prisma, jobsService };
}

describe('BuktiDukungService.create', () => {
  it('rejects PROGRAM_STUDI without programStudiId', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, programStudiId: null });
    await expect(
      service.create({ ownerTipe: OwnerTipe.PROGRAM_STUDI }, FILE),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects TENANT with a programStudiId set', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, programStudiId: null });
    await expect(
      service.create({ ownerTipe: OwnerTipe.TENANT, programStudiId: 'p1' }, FILE),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a PENYUSUN uploading at TENANT level', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, programStudiId: 'p1' });
    await expect(
      service.create({ ownerTipe: OwnerTipe.TENANT }, FILE),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a PENYUSUN uploading to a prodi that is not their own', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, programStudiId: 'p1' });
    await expect(
      service.create({ ownerTipe: OwnerTipe.PROGRAM_STUDI, programStudiId: 'p2' }, FILE),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a programStudiId that does not belong to the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, programStudiId: null });
    prisma.programStudi.findFirst.mockResolvedValue(null);
    await expect(
      service.create({ ownerTipe: OwnerTipe.PROGRAM_STUDI, programStudiId: 'p1' }, FILE),
    ).rejects.toThrow(NotFoundException);
  });

  it('saves the file, creates the row, and enqueues INGESTION_BUKTI_DUKUNG', async () => {
    const { service, prisma, jobsService } = makeService({
      tenantId: 't1', role: Role.PENJAMIN_MUTU, programStudiId: null,
    });
    prisma.programStudi.findFirst.mockResolvedValue({ id: 'p1' });

    const result = await service.create(
      { ownerTipe: OwnerTipe.PROGRAM_STUDI, programStudiId: 'p1' },
      FILE,
    );

    expect(storage.saveBuktiDukungFile).toHaveBeenCalled();
    expect(prisma.buktiDukung.create).toHaveBeenCalled();
    expect(jobsService.enqueue).toHaveBeenCalledWith(
      'INGESTION_BUKTI_DUKUNG',
      expect.objectContaining({ tenantId: 't1' }),
    );
    expect(result.fileUrl).toBe('t1/tenant/bukti.txt');
  });
});

describe('BuktiDukungService.findAll', () => {
  it('rejects a PENYUSUN listing tenant-level (no programStudiId)', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, programStudiId: 'p1' });
    await expect(service.findAll(undefined)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a PENYUSUN listing a prodi that is not their own', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, programStudiId: 'p1' });
    await expect(service.findAll('p2')).rejects.toThrow(ForbiddenException);
  });

  it('allows PIMPINAN to list tenant-level', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, programStudiId: null });
    await service.findAll(undefined);
    expect(prisma.buktiDukung.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', ownerTipe: OwnerTipe.TENANT } }),
    );
  });
});

describe('BuktiDukungService.remove', () => {
  it('throws NotFoundException when the row does not exist in the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENJAMIN_MUTU, programStudiId: null });
    prisma.buktiDukung.findFirst.mockResolvedValue(null);
    await expect(service.remove('b1')).rejects.toThrow(NotFoundException);
  });

  it('rejects a PENYUSUN deleting a bukti dukung uploaded by someone else', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENYUSUN, programStudiId: 'p1' });
    prisma.buktiDukung.findFirst.mockResolvedValue({ id: 'b1', diunggahOlehUserId: 'someone-else', fileUrl: 'x' });
    await expect(service.remove('b1')).rejects.toThrow(ForbiddenException);
  });

  it('allows a PENYUSUN to delete their own upload', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENYUSUN, programStudiId: 'p1' });
    prisma.buktiDukung.findFirst.mockResolvedValue({ id: 'b1', diunggahOlehUserId: 'u1', fileUrl: 'x' });
    await service.remove('b1');
    expect(prisma.buktiDukung.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(storage.deleteBuktiDukungFile).toHaveBeenCalledWith('x');
  });
});
