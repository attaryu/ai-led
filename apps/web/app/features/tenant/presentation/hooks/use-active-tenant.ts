import { tenantRepository } from '../../data/repositories/tenant.repository';
import { type TenantEntity } from '../../domain/entities/tenant.entity';

/**
 * Tenant yang sedang aktif untuk session ini.
 *
 * Dipakai ketiga lapis ruang kerja lewat `AppShell.sidebar.universityName`.
 * Dibungkus hook — bukan dipanggil langsung dari repository di komponen —
 * supaya saat tenant nanti datang dari API (dan butuh state/loading), yang
 * berubah cukup di sini.
 */
export function useActiveTenant(): TenantEntity {
	return tenantRepository.getActive();
}
