import { useParams } from 'react-router';

import { PlaceholderPage } from '~/core/components/placeholder-page';
import { ledProjectRepository } from '../../data/repositories/led-project.repository';

/**
 * Ringkasan/progres per bab (docs/application_flow.md §6.1).
 *
 * Masih kosong karena entitas `BAB_DOKUMEN` belum ada di kode. Rutenya sudah
 * final supaya Editor Bab (Lapis 4) nanti tinggal menambah anak di sini.
 */
export function LedProjectWorkspaceHome() {
	const { projectId } = useParams<{ projectId: string }>();
	const ledProject = projectId
		? ledProjectRepository.findById(projectId)
		: undefined;

	return (
		<PlaceholderPage
			title="Progres per Bab"
			description="Daftar bab beserta status kunci, waktu simpan terakhir, dan ringkasan skor rubrik akan tampil di sini. Entitas BAB_DOKUMEN belum tersedia."
			links={[
				...(ledProject
					? [
							{
								label: 'Bukti Dukung prodi ini',
								to: `/study-programs/${ledProject.studyProgramId}/evidence`,
							},
						]
					: []),
				{ label: 'Dokumen LED lintas prodi', to: '/dashboard/led-projects' },
			]}
		/>
	);
}
