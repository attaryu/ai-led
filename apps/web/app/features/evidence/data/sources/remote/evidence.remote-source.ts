import { apiFetch } from '~/core/lib/api-client';
import { mapBuktiDukungToEvidence, type BuktiDukungApiRow } from '../../backend-mappers';
import { type EvidenceEntity, type EvidenceOwnerType } from '../../../domain/entities/evidence.entity';

/**
 * `GET /bukti-dukung` (bukti-dukung.controller.ts): tanpa `programStudiId`
 * hanya mengembalikan baris level TENANT, dan menolak 403 untuk role PENYUSUN
 * (docs/database.md §7 — perpustakaan level universitas cuma Pimpinan/Penjamin
 * Mutu). Dengan `programStudiId` mengembalikan baris milik prodi itu saja.
 */
export const evidenceRemoteSource = {
	async findAll({
		ownerTipe,
		studyProgramId,
	}: {
		ownerTipe: EvidenceOwnerType;
		studyProgramId?: string | null;
	}): Promise<EvidenceEntity[]> {
		const query =
			ownerTipe === 'PROGRAM_STUDI' && studyProgramId
				? `?programStudiId=${encodeURIComponent(studyProgramId)}`
				: '';
		const rows = await apiFetch<BuktiDukungApiRow[]>(`/bukti-dukung${query}`);
		return rows.map(mapBuktiDukungToEvidence);
	},

	async remove(id: string): Promise<void> {
		await apiFetch(`/bukti-dukung/${id}`, { method: 'DELETE' });
	},
};
