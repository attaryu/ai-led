import { Navigate } from 'react-router';

import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { EvidenceLibrary } from '../components/evidence-library';

/**
 * Perpustakaan Bukti Dukung level tenant (docs/application_flow.md §4.4).
 *
 * Penjaga lapis (`useRoleGuard('tenant')` di DashboardLayout) meloloskan Admin
 * karena ia memang berwenang atas menu organisasi lainnya — padahal §4.4
 * menyatakan Admin tidak punya akses ke bukti dukung sama sekali. Menyembunyikan
 * menunya di sidebar tidak cukup (URL tetap bisa diketik), jadi penolakannya
 * ditegaskan di sini.
 */
export function TenantEvidenceLibrary() {
	const session = useSession();

	if (!session) return null;
	if (session.role === 'Admin') return <Navigate to="/dashboard" replace />;

	return <EvidenceLibrary level="TENANT" />;
}
