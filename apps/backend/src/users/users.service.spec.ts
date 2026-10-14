import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
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
  role?: Role;
}) {
  const prisma = {
    user: {
      findUnique: overrides?.findUnique ?? jest.fn().mockResolvedValue(null),
      create: overrides?.create ?? jest.fn((args: { data: unknown }) =>
        Promise.resolve({ id: 'user-1', passwordHash: 'hash', ...(args.data as object) }),
      ),
      findFirst: overrides?.findFirst ?? jest.fn(),
      update: overrides?.update ?? jest.fn((args: { data: unknown }) =>
        Promise.resolve({ id: 'user-1', passwordHash: 'hash', ...(args.data as object) }),
      ),
      delete: jest.fn(),
    },
  };
  const tenantContext: Pick<TenantContextService, 'getOrThrow'> = {
    getOrThrow: jest
      .fn()
      .mockReturnValue({ tenantId: TENANT_ID, role: overrides?.role ?? Role.ADMIN }),
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
  it('rejects a PENYUSUN without studyProgramId', async () => {
    const { service } = makeService();
    await expect(
      service.create({
        fullName: 'Budi',
        email: 'budi@example.com',
        password: 'password123',
        role: Role.PENYUSUN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a PENYUSUN with studyProgramId and returns no passwordHash', async () => {
    const { service, programStudi } = makeService();
    const user = await service.create({
      fullName: 'Budi',
      email: 'budi@example.com',
      password: 'password123',
      role: Role.PENYUSUN,
      studyProgramId: 'prodi-1',
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
        fullName: 'Budi',
        email: 'budi@example.com',
        password: 'password123',
        role: Role.PIMPINAN,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('UsersService.update — PIMPINAN', () => {
  it('rejects moving a non-PENYUSUN user', async () => {
    const { service } = makeService({
      role: Role.PIMPINAN,
      findFirst: jest.fn().mockResolvedValue({ id: 'user-1', role: Role.PIMPINAN }),
    });
    await expect(
      service.update('user-1', { studyProgramId: 'prodi-2' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects any field other than studyProgramId', async () => {
    const { service } = makeService({
      role: Role.PIMPINAN,
      findFirst: jest.fn().mockResolvedValue({ id: 'user-1', role: Role.PENYUSUN }),
    });
    await expect(
      service.update('user-1', { studyProgramId: 'prodi-2', fullName: 'Baru' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('moves a PENYUSUN to another program studi', async () => {
    const { service, programStudi, prisma } = makeService({
      role: Role.PIMPINAN,
      findFirst: jest.fn().mockResolvedValue({ id: 'user-1', role: Role.PENYUSUN }),
    });

    const user = await service.update('user-1', { studyProgramId: 'prodi-2' });

    expect(programStudi.findOne).toHaveBeenCalledWith('prodi-2');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { studyProgramId: 'prodi-2' },
    });
    expect(user).not.toHaveProperty('passwordHash');
  });
});

describe('UsersService.update — ADMIN', () => {
  it('edits profile fields and clears studyProgramId when role leaves PENYUSUN', async () => {
    const { service, prisma } = makeService({
      role: Role.ADMIN,
      findFirst: jest.fn().mockResolvedValue({
        id: 'user-1',
        role: Role.PENYUSUN,
        studyProgramId: 'prodi-1',
      }),
    });

    const user = await service.update('user-1', {
      fullName: 'Baru',
      role: Role.PIMPINAN,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { fullName: 'Baru', role: Role.PIMPINAN, studyProgramId: null },
    });
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('rejects turning a user into PENYUSUN without a studyProgramId', async () => {
    const { service } = makeService({
      role: Role.ADMIN,
      findFirst: jest.fn().mockResolvedValue({
        id: 'user-1',
        role: Role.PIMPINAN,
        studyProgramId: null,
      }),
    });

    await expect(
      service.update('user-1', { role: Role.PENYUSUN }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UsersService.findAll', () => {
  it('never returns password hashes', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', fullName: 'A', passwordHash: 'bcrypt$', studyProgram: { name: 'TI' } },
        ]),
      },
    };
    const tenantContext = { getOrThrow: () => ({ tenantId: 't1' }) };
    const service = new UsersService(prisma as never, tenantContext as never, {} as never);

    const [user] = await service.findAll();

    expect(user).not.toHaveProperty('passwordHash');
    expect(user).toMatchObject({ id: 'u1', studyProgram: { name: 'TI' } });
  });
});

describe('UsersService.findPenyusunByProdi', () => {
  it('filters by tenant, PENYUSUN role and prodi, without passwordHash', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'u1',
        tenantId: TENANT_ID,
        fullName: 'Fajar',
        email: 'f@example.com',
        passwordHash: 'hash',
        role: Role.PENYUSUN,
        studyProgramId: 'prodi-1',
        studyProgram: { name: 'SI' },
      },
    ]);
    const { service, prisma } = makeService({ role: Role.PENJAMIN_MUTU });
    (prisma.user as unknown as { findMany: jest.Mock }).findMany = findMany;

    const result = await service.findPenyusunByProdi('prodi-1');

    expect(findMany.mock.calls[0][0].where).toEqual({
      tenantId: TENANT_ID,
      role: Role.PENYUSUN,
      studyProgramId: 'prodi-1',
    });
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('passwordHash');
  });

  it('rejects an empty programStudiId', async () => {
    const { service } = makeService({ role: Role.PENJAMIN_MUTU });
    await expect(service.findPenyusunByProdi('')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('UsersController role metadata', () => {
  const rolesOf = (method: string): Role[] => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UsersController } = require('./users.controller');
    const proto = UsersController.prototype as Record<string, object>;
    const keys = Reflect.getMetadataKeys(proto[method]);
    const key = keys.find((k: string) => /role/i.test(String(k)));
    return Reflect.getMetadata(key, proto[method]);
  };

  it('opens /users/penyusun to PENJAMIN_MUTU but keeps GET /users closed', () => {
    expect(rolesOf('findPenyusun')).toContain(Role.PENJAMIN_MUTU);
    expect(rolesOf('findPenyusun')).not.toContain(Role.PENYUSUN);
    expect(rolesOf('findAll')).not.toContain(Role.PENJAMIN_MUTU);
  });
});
