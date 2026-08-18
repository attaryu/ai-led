import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role } from '@ai-led/db';
import { UsersService } from './users.service';
import type { ProgramStudiService } from '../program-studi/program-studi.service';
import type { TenantContextService } from '../tenant/tenant-context.service';

const TENANT_ID = 'tenant-1';

function makeService(overrides?: {
  findUnique?: jest.Mock;
  create?: jest.Mock;
  findFirst?: jest.Mock;
  update?: jest.Mock;
}) {
  const prisma = {
    user: {
      findUnique: overrides?.findUnique ?? jest.fn().mockResolvedValue(null),
      create: overrides?.create ?? jest.fn((args: { data: unknown }) =>
        Promise.resolve({ id: 'user-1', passwordHash: 'hash', ...(args.data as object) }),
      ),
      findFirst: overrides?.findFirst ?? jest.fn(),
      update: overrides?.update ?? jest.fn(),
    },
  };
  const tenantContext: Pick<TenantContextService, 'getOrThrow'> = {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: TENANT_ID }),
  };
  const programStudi: Pick<ProgramStudiService, 'findOne'> = {
    findOne: jest.fn().mockResolvedValue({ id: 'prodi-1', tenantId: TENANT_ID }),
  };
  const service = new UsersService(
    prisma as never,
    tenantContext as TenantContextService,
    programStudi as ProgramStudiService,
  );
  return { service, prisma, programStudi };
}

describe('UsersService.create', () => {
  it('rejects a PENYUSUN without programStudiId', async () => {
    const { service } = makeService();
    await expect(
      service.create({
        namaLengkap: 'Budi',
        email: 'budi@example.com',
        password: 'password123',
        role: Role.PENYUSUN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a PENYUSUN with programStudiId and returns no passwordHash', async () => {
    const { service, programStudi } = makeService();
    const user = await service.create({
      namaLengkap: 'Budi',
      email: 'budi@example.com',
      password: 'password123',
      role: Role.PENYUSUN,
      programStudiId: 'prodi-1',
    });

    expect(programStudi.findOne).toHaveBeenCalledWith('prodi-1');
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email', async () => {
    const { service } = makeService({
      findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
    });
    await expect(
      service.create({
        namaLengkap: 'Budi',
        email: 'budi@example.com',
        password: 'password123',
        role: Role.PIMPINAN,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('UsersService.move', () => {
  it('rejects moving a non-PENYUSUN user', async () => {
    const { service } = makeService({
      findFirst: jest.fn().mockResolvedValue({ id: 'user-1', role: Role.PIMPINAN }),
    });
    await expect(
      service.move('user-1', { programStudiId: 'prodi-2' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('moves a PENYUSUN to another program studi', async () => {
    const { service, programStudi, prisma } = makeService({
      findFirst: jest.fn().mockResolvedValue({ id: 'user-1', role: Role.PENYUSUN }),
      update: jest.fn((args: { data: unknown }) =>
        Promise.resolve({ id: 'user-1', passwordHash: 'hash', ...(args.data as object) }),
      ),
    });

    const user = await service.move('user-1', { programStudiId: 'prodi-2' });

    expect(programStudi.findOne).toHaveBeenCalledWith('prodi-2');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { programStudiId: 'prodi-2' },
    });
    expect(user).not.toHaveProperty('passwordHash');
  });
});
