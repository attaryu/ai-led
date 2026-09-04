import { ProgramEvidenceLibrary } from '~/features/evidence/presentation/pages/program-evidence-library';

/**
 * Perpustakaan Bukti Dukung level prodi (docs/application_flow.md §5.2).
 *
 * Isinya milik fitur `evidence` karena kedua lapis (tenant & prodi) memakai
 * badan halaman yang sama; berkas ini tinggal jadi titik pasang rutenya.
 */
export function StudyProgramWorkspaceEvidence() {
	return <ProgramEvidenceLibrary />;
}
