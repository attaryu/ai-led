import { apiFetch } from '~/core/lib/api-client';

export type BackendTenant = {
	id: string;
	namaUniversitas: string;
};

export const tenantRemoteSource = {
	findById(id: string): Promise<BackendTenant> {
		return apiFetch<BackendTenant>(`/tenants/${id}`);
	},
};
