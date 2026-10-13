import { PeringkatAkreditasi } from '@ai-led/db';
import { ProgramStudiService } from './program-studi.service';
import type { PrismaService } from '../database/prisma.service';
import type { TenantContextService } from '../tenant/tenant-context.service';

function makeService() {
  const create = jest.fn().mockResolvedValue({ id: 'p1' });
  const prisma = { studyProgram: { create } };
  const tenantContext: Pick<TenantContextService, 'getOrThrow'> = {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 't1' }),
  };
  const service = new ProgramStudiService(
    prisma as unknown as PrismaService,
    tenantContext as TenantContextService,
  );
  return { service, create };
}

const base = {
  name: 'Teknik Informatika',
  code: 'IF',
  level: 'S1',
  faculty: 'FTI',
  programHead: 'Dr. Budi',
} as never;

describe('ProgramStudiService.create', () => {
  it('defaults accreditationRank to BELUM_TERAKREDITASI when omitted', async () => {
    const { service, create } = makeService();

    await service.create({ ...(base as object) } as never);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        accreditationRank: PeringkatAkreditasi.BELUM_TERAKREDITASI,
      }),
    });
  });

  it('keeps the rank when the caller sends one', async () => {
    const { service, create } = makeService();

    await service.create({
      ...(base as object),
      accreditationRank: PeringkatAkreditasi.UNGGUL,
    } as never);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accreditationRank: PeringkatAkreditasi.UNGGUL }),
    });
  });
});
