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
 * **Dua lapis pembekuan, urut dari yang paling membatasi.** Keduanya memakai
 * mekanisme yang sama dan hanya berbeda siapa pemegang kuncinya:
 *
 * | | Penyusun | Penjamin Mutu | Pemegang kunci |
 * | --- | --- | --- | --- |
 * | Biasa | boleh edit | boleh edit | — |
 * | Diajukan | beku | boleh edit | Penyusun |
 * | Terkunci | beku | beku | Penjamin Mutu |
 *
 * `terkunci` dinilai lebih dulu supaya ia mengalahkan role mana pun: §12.2
 * memblokir aksi ubah untuk semua orang, termasuk Penjamin Mutu yang menguncinya
 * sendiri. Pengajuan menyusul di bawahnya dan hanya menggigit Penyusun —
 * merapikan bab justru bagian dari cara Penjamin Mutu mereview.
 *
 * Yang tidak boleh ikut terpengaruh keduanya adalah hak baca: §12.2 menegaskan
 * seluruh tab tetap bisa dibuka untuk dibaca.
 */
export type AlasanBlokir = 'terkunci' | 'diajukan' | 'hanya-baca';

export type ChapterPermission = {
	session: SessionEntity | null;
	canRead: boolean;
	canEdit: boolean;
	/**
	 * Hak menjalankan review §12.2: mengunci/membuka bab **dan** menulis
	 * catatannya. Satu boolean untuk keduanya karena syaratnya memang sama persis
	 * — hanya `Penjamin Mutu` — dan dua nama untuk satu aturan pasti menyimpang.
	 */
	canReview: boolean;
	/**
	 * Hak mengajukan bab untuk direview dan mencabutnya lagi — milik Penyusun
	 * pemilik dokumen.
	 *
	 * Terpisah dari `canEdit` dan sengaja **bertahan melewati pembekuan**: tombol
	 * "Batalkan Pengajuan" justru harus ada persis saat `canEdit` sudah `false`
	 * karena pengajuannya sendiri.
	 */
	canSubmitReview: boolean;
	/** Kenapa editor dimatikan, untuk spanduk di atas kanvas; `null` bila boleh. */
	blockedReason: AlasanBlokir | null;
};

/**
 * Frasa pembuka kalimat "kenapa aksi ini tidak ada", dipakai bersama spanduk
 * kanvas dan kaki tab Draft/Generasi.
 *
 * Satu sumber supaya ketiganya tidak menyimpang, dan `Record` supaya alasan
 * baru jadi compile error alih-alih diam-diam jatuh ke kalimat yang keliru.
 */
export const frasaBlokir: Record<AlasanBlokir, string> = {
	terkunci: 'Bab ini dikunci Penjamin Mutu',
	diajukan: 'Bab ini sedang menunggu review',
	'hanya-baca': 'Anda membuka bab ini dalam mode baca',
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
			canReview: false,
			canSubmitReview: false,
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
	const canReview = session.role === 'Penjamin Mutu';
	const canSubmitReview = isOwnProgram;

	if (chapter?.terkunci) {
		return {
			session,
			canRead,
			canEdit: false,
			canReview,
			// Bab yang sudah dikunci sedang direview Penjamin Mutu; tidak ada yang
			// bisa diajukan maupun dicabut dari sana.
			canSubmitReview: false,
			blockedReason: canRead ? 'terkunci' : null,
		};
	}

	if (chapter?.diajukanReviewPada && session.role === 'Penyusun') {
		return {
			session,
			canRead,
			canEdit: false,
			canReview,
			canSubmitReview,
			blockedReason: canRead ? 'diajukan' : null,
		};
	}

	return {
		session,
		canRead,
		canEdit: canRead && canWriteByRole,
		canReview,
		canSubmitReview,
		blockedReason: canRead && !canWriteByRole ? 'hanya-baca' : null,
	};
}
