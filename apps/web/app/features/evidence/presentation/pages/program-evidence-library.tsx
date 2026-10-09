import { useOutletContext, useParams } from 'react-router';

import { type StudyProgramEntity } from '~/features/study-program/domain/entities/study-program.entity';
import { EvidenceLibrary } from '../components/evidence-library';
import { LkpsCard } from '../components/lkps-card';

/**
 * Perpustakaan Bukti Dukung level prodi (docs/application_flow.md §5.2).
 *
 * Hak akses lapis ini sudah dijaga `StudyProgramWorkspaceLayout` (Admin ditolak,
 * Penyusun hanya prodinya sendiri), jadi halaman tinggal mengikuti `:programId`
 * di URL — yang sekaligus jadi target semua unggahan di halaman ini. Nama prodi
 * diambil dari layout lewat outlet context, bukan lookup terpisah.
 */
export function ProgramEvidenceLibrary() {
	const { programId } = useParams<{ programId: string }>();
	const studyProgram = useOutletContext<StudyProgramEntity>();

	return (
		<div className="flex flex-col gap-6">
			{programId && <LkpsCard studyProgramId={programId} />}
			<EvidenceLibrary
				level="PROGRAM_STUDI"
				studyProgramId={programId}
				studyProgramName={studyProgram.studyProgramName}
			/>
		</div>
	);
}
