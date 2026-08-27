import { apiFetch } from '~/core/lib/api-client';
import { type EvidenceOwnerType } from '../../../domain/entities/evidence.entity';
import { type EvidenceFolderEntity } from '../../../domain/entities/evidence-folder.entity';

/** Bentuk baris `GET/POST /evidence-folder` — nama kolom asli NestJS/Prisma. */
export type EvidenceFolderApiRow = {
	id: string;
	ownerType: EvidenceOwnerType;
	tenantId: string | null;
	studyProgramId: string | null;
	name: string;
	parentId: string | null;
	createdByUserId: string;
	createdByName: string;
	createdAt: string;
};

/**
 * `tenantId` backend selalu terisi (kolom isolasi tenant, sama seperti baris
 * `Evidence` — lihat `backend-mappers.ts::mapBuktiDukungToEvidence`), dinolkan
 * di sini untuk folder PROGRAM_STUDI supaya cocok dengan `dalamCakupan`
 * (evidence-folder.entity.ts), yang membandingkan tenantId hanya untuk TENANT.
 */
function mapRow(row: EvidenceFolderApiRow): EvidenceFolderEntity {
	return {
		id: row.id,
		ownerTipe: row.ownerType,
		tenantId: row.ownerType === 'TENANT' ? row.tenantId : null,
		studyProgramId: row.studyProgramId,
		nama: row.name,
		parentId: row.parentId,
		dibuatOlehUserId: row.createdByUserId,
		dibuatOlehNama: row.createdByName,
		waktuDibuat: row.createdAt,
	};
}

export const evidenceFolderRemoteSource = {
	async findByScope(
		ownerTipe: EvidenceOwnerType,
		studyProgramId: string | null,
	): Promise<EvidenceFolderEntity[]> {
		const query =
			ownerTipe === 'PROGRAM_STUDI' && studyProgramId
				? `?ownerType=${ownerTipe}&studyProgramId=${encodeURIComponent(studyProgramId)}`
				: `?ownerType=${ownerTipe}`;
		const rows = await apiFetch<EvidenceFolderApiRow[]>(`/evidence-folder${query}`);
		return rows.map(mapRow);
	},

	async create(input: {
		ownerType: EvidenceOwnerType;
		studyProgramId: string | null;
		name: string;
		parentId: string | null;
	}): Promise<EvidenceFolderEntity> {
		const row = await apiFetch<EvidenceFolderApiRow>('/evidence-folder', {
			method: 'POST',
			body: {
				ownerType: input.ownerType,
				studyProgramId: input.studyProgramId ?? undefined,
				name: input.name,
				parentId: input.parentId,
			},
		});
		return mapRow(row);
	},

	async rename(id: string, name: string): Promise<void> {
		await apiFetch(`/evidence-folder/${id}`, { method: 'PATCH', body: { name } });
	},

	async move(id: string, parentId: string | null): Promise<void> {
		await apiFetch(`/evidence-folder/${id}/move`, { method: 'PATCH', body: { parentId } });
	},

	async removeMany(ids: string[]): Promise<void> {
		await apiFetch('/evidence-folder/remove', { method: 'POST', body: { ids } });
	},

	async assignMany(evidenceIds: string[], folderId: string | null): Promise<void> {
		await apiFetch('/evidence-folder/assign', { method: 'POST', body: { evidenceIds, folderId } });
	},

	/** Batch upsert-by-path — lihat evidence-folder.service.ts::ensurePaths di backend. */
	async ensureFolderPaths(input: {
		ownerType: EvidenceOwnerType;
		studyProgramId: string | null;
		parentId: string | null;
		paths: string[][];
	}): Promise<Record<string, string | null>> {
		return apiFetch<Record<string, string | null>>('/evidence-folder/ensure-paths', {
			method: 'POST',
			body: {
				ownerType: input.ownerType,
				studyProgramId: input.studyProgramId ?? undefined,
				parentId: input.parentId,
				paths: input.paths,
			},
		});
	},
};
