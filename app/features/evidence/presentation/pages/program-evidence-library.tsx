import { useParams } from 'react-router';

import { studyProgramRepository } from '~/features/study-program/data/repositories/study-program.repository';
import { EvidenceLibrary } from '../components/evidence-library';

/**
 * Perpustakaan Bukti Dukung level prodi (docs/application_flow.md §5.2).
 *
 * Hak akses lapis ini sudah dijaga `StudyProgramWorkspaceLayout` (Admin ditolak,
 * Penyusun hanya prodinya sendiri), jadi halaman tinggal mengikuti `:programId`
 * di URL — yang sekaligus jadi target semua unggahan di halaman ini.
 */
export function ProgramEvidenceLibrary() {
	const { programId } = useParams<{ programId: string }>();
	const studyProgram = programId
		? studyProgramRepository.findById(programId)
		: undefined;

	return (
		<EvidenceLibrary
			level="PROGRAM_STUDI"
			studyProgramId={programId}
			studyProgramName={studyProgram?.studyProgramName}
		/>
	);
}
