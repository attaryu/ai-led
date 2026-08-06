import { type SessionEntity } from '~/features/auth/domain/entities/session.entity';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';

/**
 * Terjemahan matriks hak akses Editor Bab (docs/application_flow.md §15) plus
 * kunci review (§12.2) ke satu tempat, mengikuti bentuk
 * {@link ../../../evidence/presentation/hooks/use-evidence-permission useEvidencePermission}:
 *
 * - `ADMIN` tidak punya akses ke dokumen LED sama sekali (§4.4) — walau
 *   praktiknya sudah dipulangkan `useRoleGuard` sebelum halaman ini dirender.
 * - `PIMPINAN` boleh membaca seluruh bab, tapi tidak pernah mengubah kontennya.
 * - `PENJAMIN_MUTU` boleh mengubah, dan hanya ia yang boleh mengunci/membuka.
 * - `PENYUSUN` boleh mengubah bab dokumen milik prodinya sendiri.
 *
 * `terkunci` dinilai **paling akhir** supaya ia mengalahkan role mana pun: §12.2
 * memblokir aksi ubah untuk semua orang, termasuk Penjamin Mutu yang menguncinya
 * sendiri. Yang tidak boleh ikut terpengaruh adalah hak baca — pasal yang sama
 * menegaskan seluruh tab tetap bisa dibuka untuk dibaca saat bab dikunci.
 */
export type ChapterPermission = {
	session: SessionEntity | null;
	canRead: boolean;
	canEdit: boolean;
	/** Tombolnya sendiri milik iterasi review; di sini baru haknya. */
	canToggleLock: boolean;
	/** Kenapa editor dimatikan, untuk spanduk di atas kanvas; `null` bila boleh. */
	blockedReason: 'terkunci' | 'hanya-baca' | null;
};

export function useChapterPermission(
	chapter: ChapterEntity | undefined,
	/** `studyProgramId` milik dokumennya — dibaca dari data, bukan dari URL. */
	studyProgramId: string | undefined,
): ChapterPermission {
	const session = useSession();

	if (!session || session.role === 'Admin') {
		return {
			session,
			canRead: false,
			canEdit: false,
			canToggleLock: false,
			blockedReason: 'hanya-baca',
		};
	}

	const isTenantWide =
		session.role === 'Pimpinan' || session.role === 'Penjamin Mutu';
	const isOwnProgram =
		session.role === 'Penyusun' &&
		Boolean(studyProgramId) &&
		session.studyProgramId === studyProgramId;

	const canRead = isTenantWide || isOwnProgram;
	// Pimpinan memantau, tidak menyusun (§15): cakupannya sama luas dengan
	// Penjamin Mutu, yang berbeda baca-vs-tulis.
	const canWriteByRole =
		session.role === 'Penjamin Mutu' || (isOwnProgram && canRead);

	if (chapter?.terkunci) {
		return {
			session,
			canRead,
			canEdit: false,
			canToggleLock: session.role === 'Penjamin Mutu',
			blockedReason: canRead ? 'terkunci' : null,
		};
	}

	return {
		session,
		canRead,
		canEdit: canRead && canWriteByRole,
		canToggleLock: session.role === 'Penjamin Mutu',
		blockedReason: canRead && !canWriteByRole ? 'hanya-baca' : null,
	};
}
