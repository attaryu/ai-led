import { Role } from '@ai-led/db';
import { DokumenLedService } from './dokumen-led.service';
import type { TenantContextService } from '../tenant/tenant-context.service';

function makeService(context: {
  tenantId: string;
  role: Role;
  programStudiId: string | null;
}) {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = { dokumenLed: { findMany } };
  const tenantContext: Pick<TenantContextService, 'getOrThrow'> = {
    getOrThrow: jest.fn().mockReturnValue({ userId: 'u1', ...context }),
  };
  const service = new DokumenLedService(
    prisma as never,
    tenantContext as TenantContextService,
  );
  return { service, findMany };
}

describe('DokumenLedService.findAllForTenant', () => {
  it('returns an empty list for a PENYUSUN with no assigned prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PENYUSUN,
      programStudiId: null,
    });

    await expect(service.findAllForTenant()).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('scopes a PENYUSUN to their own prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PENYUSUN,
      programStudiId: 'prodi-1',
    });

    await service.findAllForTenant();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          programStudi: { tenantId: 't1' },
          programStudiId: 'prodi-1',
        }) as unknown,
      }),
    );
  });

  it('does not scope PIMPINAN/PENJAMIN_MUTU/ADMIN to any single prodi', async () => {
    const { service, findMany } = makeService({
      tenantId: 't1',
      role: Role.PIMPINAN,
      programStudiId: null,
    });

    await service.findAllForTenant();
    const call = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('programStudiId');
  });
});
