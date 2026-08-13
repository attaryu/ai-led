import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { type SessionEntity } from '~/features/auth/domain/entities/session.entity';
import {
	type EvidenceEntity,
	type EvidenceOwnerType,
} from '../../domain/entities/evidence.entity';

/**
 * Terjemahan matriks hak akses bukti dukung (docs/application_flow.md §15) ke
 * satu tempat, supaya tiap komponen tidak menuliskan ulang aturannya:
 *
 * - `ADMIN` tidak punya akses ke bukti dukung sama sekali (§4.4).
 * - `PIMPINAN` & `PENJAMIN_MUTU` boleh unggah di kedua level.
 * - `PENYUSUN` hanya di level prodi tempatnya ditugaskan.
 *
 * Menghapus belum tercantum di §15; keputusan yang dipakai di sini: Pimpinan &
 * Penjamin Mutu boleh menghapus apa pun, Penyusun hanya unggahannya sendiri.
 */
export type EvidencePermission = {
	session: SessionEntity | null;
	canView: boolean;
	canUpload: boolean;
	/**
	 * Boleh mengarahkan unggahan ke level universitas, bukan cuma ke satu prodi.
	 *
	 * Dipisah dari `canUpload` karena ada tempat yang cakupannya sudah terkunci ke
	 * satu prodi — Perpustakaan Bukti Dukung prodi dan tab Generasi di Editor Bab —
	 * tapi pengunggahnya sendiri berwenang lintas prodi. Di situ pilihan targetnya
	 * cukup dua: prodi yang sedang dibuka, atau universitas. Prodi lain tidak
	 * pernah jadi pilihan; untuk itu ada perpustakaan tenant (§4.4.1).
	 */
	canUploadTenant: boolean;
	canDelete: (evidence: EvidenceEntity) => boolean;
	canRetry: (evidence: EvidenceEntity) => boolean;
};

export function useEvidencePermission(
	level: EvidenceOwnerType,
	studyProgramId?: string,
): EvidencePermission {
	const session = useSession();

	if (!session || session.role === 'Admin') {
		return {
			session,
			canView: false,
			canUpload: false,
			canUploadTenant: false,
			canDelete: () => false,
			canRetry: () => false,
		};
	}

	const isTenantWide =
		session.role === 'Pimpinan' || session.role === 'Penjamin Mutu';
	const isOwnProgram =
		session.role === 'Penyusun' &&
		Boolean(studyProgramId) &&
		session.studyProgramId === studyProgramId;

	const canView =
		level === 'TENANT' ? isTenantWide : isTenantWide || isOwnProgram;
	const canUpload = canView;

	const canDelete = (evidence: EvidenceEntity) => {
		if (!canView) return false;
		if (isTenantWide) return true;
		return evidence.uploadedByUserId === session.userId;
	};

	return {
		session,
		canView,
		canUpload,
		canUploadTenant: canUpload && isTenantWide,
		canDelete,
		// Ekstraksi ulang tidak menghapus apa pun, jadi cukup hak lihat + unggah.
		canRetry: () => canUpload,
	};
}
