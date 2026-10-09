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
		kind,
	}: {
		ownerTipe: EvidenceOwnerType;
		studyProgramId?: string | null;
		/** Default backend: Bukti Dukung saja. `LKPS` = Excel LKPS prodi. */
		kind?: 'LKPS';
	}): Promise<EvidenceEntity[]> {
		const params = new URLSearchParams();
		if (ownerTipe === 'PROGRAM_STUDI' && studyProgramId) params.set('programStudiId', studyProgramId);
		if (kind) params.set('kind', kind);
		const query = params.size ? `?${params}` : '';
		const rows = await apiFetch<BuktiDukungApiRow[]>(`/bukti-dukung${query}`);
		return rows.map(mapBuktiDukungToEvidence);
	},

	async remove(id: string): Promise<void> {
		await apiFetch(`/bukti-dukung/${id}`, { method: 'DELETE' });
	},

	async retry(id: string): Promise<void> {
		await apiFetch(`/bukti-dukung/${id}/retry`, { method: 'POST' });
	},

	/** `GET storage/presigned-download` — `fileKey` adalah `EvidenceEntity.fileUrl` (R2 object key, bukan URL siap-pakai). Link 5 menit, jangan disimpan. */
	async getDownloadUrl(fileKey: string): Promise<string> {
		const { downloadUrl } = await apiFetch<{ downloadUrl: string }>(
			`/storage/presigned-download?key=${encodeURIComponent(fileKey)}`,
		);
		return downloadUrl;
	},
};
