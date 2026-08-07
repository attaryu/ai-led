import { z } from 'zod';

/**
 * Universitas/perguruan tinggi pemilik ruang kerja (docs/database.md → TENANT).
 *
 * Entitas paling atas dalam hierarki: seluruh prodi, user, dokumen, dan bukti
 * dukung terikat padanya. User tidak pernah melihatnya sebagai daftar — yang
 * tampak hanyalah namanya di identitas aplikasi, karena satu session selalu
 * berada di dalam tepat satu tenant.
 */
export const tenantSchema = z.object({
	id: z.string(),
	universityName: z
		.string()
		.min(1, 'Nama universitas wajib diisi')
		.max(100, 'Nama universitas maksimal 100 karakter'),
});

export type TenantEntity = z.infer<typeof tenantSchema>;
