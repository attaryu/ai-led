import { type SessionEntity } from '~/features/auth/domain/entities/session.entity';
import { useSession } from '~/features/auth/presentation/hooks/use-session';

/**
 * Hak akses Penilaian AMI, mengikuti bentuk
 * {@link ../../../chapter/presentation/hooks/use-chapter-permission useChapterPermission}.
 *
 * Pembagiannya sengaja **sama persis** dengan yang sudah berlaku di Editor Bab,
 * karena pertanyaannya memang pertanyaan yang sama:
 *
 * | | Membaca | Menjalankan | Mengoreksi |
 * | --- | --- | --- | --- |
 * | Admin | — | — | — |
 * | Pimpinan | ya | — | — |
 * | Penjamin Mutu | ya | ya | ya |
 * | Penyusun (prodinya) | ya | ya | — |
 *
 * **Penyusun boleh menjalankan, tidak boleh mengoreksi.** Menjalankan penilaian
 * itu memeriksa pekerjaan sendiri — hal yang sama yang sudah ia lakukan lewat tab
 * Rubrik, hanya untuk seluruh dokumen sekaligus. Mengubah angkanya lain perkara:
 * itu menyatakan vonis yang menggantikan hitungan mesin, dan sejalan dengan
 * `canReview` §12.2 hanya Penjamin Mutu yang memegangnya.
 *
 * **Pimpinan memantau, tidak menyusun** (§15) — cakupannya seluas Penjamin Mutu,
 * yang berbeda baca-vs-tulis.
 */
export type AssessmentPermission = {
	session: SessionEntity | null;
	canRead: boolean;
	/** Memulai sesi penilaian baru dan menjalankan evaluasi RAGAS-nya. */
	canRun: boolean;
	/** Mengubah skor final dan mencabut koreksi. */
	canCorrect: boolean;
};

export function useAssessmentPermission(
	/** `studyProgramId` milik dokumennya — dibaca dari data, bukan dari URL. */
	studyProgramId: string | undefined,
): AssessmentPermission {
	// Halaman pemanggil sudah lewat `useRoleGuard` (lapis tenant/prodi), jadi saat
	// hook ini jalan sesi sudah pasti selesai dipulihkan — `undefined` (pending)
	// diperlakukan sama dengan `null` (belum login), bukan status ketiga di sini.
	const session = useSession() ?? null;

	if (!session || session.role === 'Admin') {
		return { session, canRead: false, canRun: false, canCorrect: false };
	}

	const isTenantWide =
		session.role === 'Pimpinan' || session.role === 'Penjamin Mutu';
	const isOwnProgram =
		session.role === 'Penyusun' &&
		Boolean(studyProgramId) &&
		session.studyProgramId === studyProgramId;

	const canRead = isTenantWide || isOwnProgram;

	return {
		session,
		canRead,
		canRun: canRead && (session.role === 'Penjamin Mutu' || isOwnProgram),
		canCorrect: session.role === 'Penjamin Mutu',
	};
}
