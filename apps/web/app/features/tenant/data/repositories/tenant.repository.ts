import { type TenantEntity } from '../../domain/entities/tenant.entity';

/**
 * Tenant contoh, mewakili universitas yang dibuat saat onboarding organisasi
 * (docs/database.md → TENANT, "Fitur terkait").
 */
const activeTenant: TenantEntity = {
	id: '1',
	universityName: 'Universitas Teknologi Nusantara',
};

export const tenantRepository = {
	/**
	 * Tenant tempat session berjalan.
	 *
	 * Selama autentikasi belum terhubung ke backend, hanya ada satu tenant dan
	 * tidak ada `tenant_id` di session untuk dicocokkan — jadi tidak ada
	 * `findById`: mengarangnya hanya akan jadi jalur yang tidak pernah dipakai.
	 * Begitu API-nya jalan, isi fungsi ini yang berganti, bukan pemanggilnya.
	 */
	getActive(): TenantEntity {
		return activeTenant;
	},
};
