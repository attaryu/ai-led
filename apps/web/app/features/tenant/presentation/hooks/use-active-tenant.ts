import * as React from 'react';

import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { tenantRepository } from '../../data/repositories/tenant.repository';
import { type TenantEntity } from '../../domain/entities/tenant.entity';

const FALLBACK: TenantEntity = { id: '', universityName: '' };

/**
 * Tenant yang sedang aktif untuk session ini.
 *
 * Dipakai ketiga lapis ruang kerja lewat `AppShell.sidebar.universityName` —
 * bukan gerbang akses (itu tugas `useRoleGuard`), jadi selama request belum
 * selesai cukup dikembalikan placeholder kosong alih-alih menggating render
 * layout yang memanggilnya.
 */
export function useActiveTenant(): TenantEntity {
	const session = useSession();
	const [tenant, setTenant] = React.useState<TenantEntity>(FALLBACK);

	React.useEffect(() => {
		if (!session) return;
		let cancelled = false;
		tenantRepository
			.getActive(session.tenantId)
			.then((result) => {
				if (!cancelled) setTenant(result);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [session?.tenantId]);

	return tenant;
}
