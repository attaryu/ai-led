import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnerTipe, Role } from '@ai-led/db';
import { EvidenceFolderService } from './evidence-folder.service';
import type { TenantContextService } from '../tenant/tenant-context.service';

function makeService(context: { tenantId: string; role: Role; studyProgramId: string | null }) {
  const prisma = {
    studyProgram: { findFirst: jest.fn() },
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ fullName: 'Test User' }) },
    evidenceFolder: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-id', ...data })),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    evidence: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const tenantContext: Pick<TenantContextService, 'getOrThrow'> = {
    getOrThrow: jest.fn().mockReturnValue({ userId: 'u1', ...context }),
  };
  const service = new EvidenceFolderService(prisma as never, tenantContext as TenantContextService);
  return { service, prisma };
}

describe('EvidenceFolderService.create', () => {
  it('creates a TENANT-level folder for PIMPINAN', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    const folder = await service.create({ ownerType: OwnerTipe.TENANT, name: 'Kebijakan' });
    expect(prisma.evidenceFolder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 't1', ownerType: OwnerTipe.TENANT, studyProgramId: null, name: 'Kebijakan' }),
      }),
    );
    expect(folder.name).toBe('Kebijakan');
  });

  it('rejects a PENYUSUN creating a TENANT-level folder', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    await expect(service.create({ ownerType: OwnerTipe.TENANT, name: 'X' })).rejects.toThrow(ForbiddenException);
  });

  it('rejects a PENYUSUN creating a folder in a prodi that is not their own', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    await expect(
      service.create({ ownerType: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p2', name: 'X' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('trims the name and defaults parentId to root', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    await service.create({ ownerType: OwnerTipe.TENANT, name: '  Laporan  ' });
    expect(prisma.evidenceFolder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Laporan', parentId: null }) }),
    );
  });
});

describe('EvidenceFolderService.rename', () => {
  it('renames a folder in the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    prisma.evidenceFolder.findFirst.mockResolvedValue({ id: 'f1', ownerType: OwnerTipe.TENANT, tenantId: 't1', studyProgramId: null });
    const result = await service.rename('f1', { name: 'Nama Baru' });
    expect(result.name).toBe('Nama Baru');
  });

  it('throws NotFoundException for a folder outside the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    prisma.evidenceFolder.findFirst.mockResolvedValue(null);
    await expect(service.rename('f1', { name: 'X' })).rejects.toThrow(NotFoundException);
  });

  it('rejects a PENYUSUN renaming a folder from a different prodi (cross-prodi isolation)', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.evidenceFolder.findFirst.mockResolvedValue({ id: 'f1', ownerType: OwnerTipe.PROGRAM_STUDI, tenantId: 't1', studyProgramId: 'p2' });
    await expect(service.rename('f1', { name: 'X' })).rejects.toThrow(ForbiddenException);
  });
});

describe('EvidenceFolderService.move', () => {
  it('moves a folder to a new parent in the same scope', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    prisma.evidenceFolder.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === 'f1'
          ? { id: 'f1', ownerType: OwnerTipe.TENANT, tenantId: 't1', studyProgramId: null }
          : { id: 'f2', ownerType: OwnerTipe.TENANT, tenantId: 't1', studyProgramId: null },
      ),
    );
    prisma.evidenceFolder.findMany.mockResolvedValue([
      { id: 'f1', parentId: null },
      { id: 'f2', parentId: null },
    ]);
    const result = await service.move('f1', { parentId: 'f2' });
    expect(result.parentId).toBe('f2');
  });

  it('rejects moving a folder into its own descendant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    // f1 -> f2 (child) -> f3 (grandchild); moving f1 into f3 must be rejected.
    prisma.evidenceFolder.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, ownerType: OwnerTipe.TENANT, tenantId: 't1', studyProgramId: null }),
    );
    prisma.evidenceFolder.findMany.mockResolvedValue([
      { id: 'f1', parentId: null },
      { id: 'f2', parentId: 'f1' },
      { id: 'f3', parentId: 'f2' },
    ]);
    await expect(service.move('f1', { parentId: 'f3' })).rejects.toThrow(BadRequestException);
  });

  it('rejects moving a folder into itself', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    prisma.evidenceFolder.findFirst.mockResolvedValue({ id: 'f1', ownerType: OwnerTipe.TENANT, tenantId: 't1', studyProgramId: null });
    prisma.evidenceFolder.findMany.mockResolvedValue([{ id: 'f1', parentId: null }]);
    await expect(service.move('f1', { parentId: 'f1' })).rejects.toThrow(BadRequestException);
  });

  it('rejects moving into a folder from a different scope', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    prisma.evidenceFolder.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === 'f1'
          ? { id: 'f1', ownerType: OwnerTipe.TENANT, tenantId: 't1', studyProgramId: null }
          : { id: 'f2', ownerType: OwnerTipe.PROGRAM_STUDI, tenantId: 't1', studyProgramId: 'p1' },
      ),
    );
    await expect(service.move('f1', { parentId: 'f2' })).rejects.toThrow(BadRequestException);
  });
});

describe('EvidenceFolderService.removeMany', () => {
  it('deletes folders owned by the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    prisma.evidenceFolder.findMany.mockResolvedValue([
      { id: 'f1', ownerType: OwnerTipe.TENANT, studyProgramId: null },
    ]);
    await service.removeMany({ ids: ['f1'] });
    expect(prisma.evidenceFolder.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['f1'] } } });
  });

  it('throws NotFoundException when some ids are outside the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    prisma.evidenceFolder.findMany.mockResolvedValue([
      { id: 'f1', ownerType: OwnerTipe.TENANT, studyProgramId: null },
    ]);
    await expect(service.removeMany({ ids: ['f1', 'f2'] })).rejects.toThrow(NotFoundException);
  });

  it('rejects a PENYUSUN deleting a folder from a different prodi', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    prisma.evidenceFolder.findMany.mockResolvedValue([
      { id: 'f1', ownerType: OwnerTipe.PROGRAM_STUDI, studyProgramId: 'p2' },
    ]);
    await expect(service.removeMany({ ids: ['f1'] })).rejects.toThrow(ForbiddenException);
  });
});

describe('EvidenceFolderService.findByScope — tenant isolation', () => {
  it('rejects a PENYUSUN listing tenant-level folders', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    await expect(service.findByScope(OwnerTipe.TENANT)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a PENYUSUN listing a prodi that is not their own', async () => {
    const { service } = makeService({ tenantId: 't1', role: Role.PENYUSUN, studyProgramId: 'p1' });
    await expect(service.findByScope(OwnerTipe.PROGRAM_STUDI, 'p2')).rejects.toThrow(ForbiddenException);
  });

  it('scopes the query to the caller tenant', async () => {
    const { service, prisma } = makeService({ tenantId: 't1', role: Role.PIMPINAN, studyProgramId: null });
    await service.findByScope(OwnerTipe.TENANT);
    expect(prisma.evidenceFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', ownerType: OwnerTipe.TENANT } }),
    );
  });
});
