import { type TenantEntity } from '../../domain/entities/tenant.entity';
import { tenantRemoteSource } from '../sources/remote/tenant.remote-source';

export const tenantRepository = {
	/** Tenant tempat session berjalan — `TenantGuard` backend memastikan hanya tenant sendiri yang bisa diminta. */
	async getActive(tenantId: string): Promise<TenantEntity> {
		const tenant = await tenantRemoteSource.findById(tenantId);
		return { id: tenant.id, universityName: tenant.universityName };
	},
};
