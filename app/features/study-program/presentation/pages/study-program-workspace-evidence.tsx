import { useParams } from 'react-router';

import { PlaceholderPage } from '~/core/components/placeholder-page';

/**
 * Perpustakaan Bukti Dukung level prodi (docs/application_flow.md §5.2).
 *
 * Kosong karena entitas `BUKTI_DUKUNG` belum ada. Rutenya sudah didaftarkan
 * supaya bentuk navigasi Lapis 2 final sekarang.
 */
export function StudyProgramWorkspaceEvidence() {
	const { programId } = useParams<{ programId: string }>();

	return (
		<PlaceholderPage
			title="Bukti Dukung Prodi"
			description="Bukti dukung di sini tidak terikat ke satu Dokumen LED, jadi otomatis tersedia untuk semua dokumen milik prodi ini. Entitas BUKTI_DUKUNG belum tersedia."
			links={[
				{ label: 'Dokumen LED prodi ini', to: `/study-programs/${programId}` },
				{ label: 'Bukti Dukung level Tenant', to: '/dashboard/evidence' },
			]}
		/>
	);
}
