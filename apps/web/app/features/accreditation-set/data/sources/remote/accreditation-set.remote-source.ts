import { apiFetch } from '~/core/lib/api-client';

/** Nilai `RubricScoreType` Prisma -- lihat packages/db/prisma/schema.prisma. */
export type BackendScoreType = 'KUALITATIF' | 'KUANTITATIF' | 'KOMPOSIT';

/** Nilai `AccreditationSetStatus` Prisma. */
export type BackendSetStatus = 'DRAF' | 'SIAP';

/** Nilai `TipePanduan` Prisma -- sama dengan `SetDocumentType` frontend. */
export type BackendDocumentType = 'DOKUMEN_RUBRIK' | 'PANDUAN_LAM' | 'TEMPLATE_LKPS';

export type BackendRubricLevel = {
	id: string;
	criterionId: string;
	score: number;
	description: string;
};

export type BackendRubricCriterionChapter = {
	id: string;
	criterionId: string;
	chapterOrder: number;
};

/** Baris Prisma `RubricCriterion`, dengan `levels`/`criterionChapters` disertakan. */
export type BackendRubricCriterion = {
	id: string;
	accreditationSetId: string;
	indicatorNo: number;
	criterionCode: string;
	criterionGroup: string;
	description: string;
	scoreType: BackendScoreType;
	lkpsTableRefs: string[];
	formula: string | null;
	subScoreFormula: string | null;
	levels: BackendRubricLevel[];
	criterionChapters: BackendRubricCriterionChapter[];
};

/** Baris Prisma `ReferenceGuide`. Tidak ada kolom ukuran berkas/pengunggah -- lihat mapper. */
export type BackendReferenceGuide = {
	id: string;
	accreditationSetId: string | null;
	type: BackendDocumentType;
	title: string;
	fileUrl: string;
	fileType: string;
	createdAt: string;
};

/** Baris Prisma `AccreditationSet` polos, seperti dikembalikan create/update/markReady. */
export type BackendAccreditationSet = {
	id: string;
	tenantId: string;
	nama: string;
	lembaga: string;
	tahunSiklus: number;
	status: BackendSetStatus;
	createdAt: string;
	updatedAt: string;
};

/** `GET /accreditation-sets` -- documents dipangkas ke `type`, criteria ke hitungannya (accreditation-set.service.ts::findAll). */
export type BackendAccreditationSetListItem = BackendAccreditationSet & {
	documents: { type: BackendDocumentType }[];
	_count: { criteria: number };
};

/** `GET /accreditation-sets/:id` -- detail penuh plus `dipakaiProyek` (accreditation-set.service.ts::toResponse). */
export type BackendAccreditationSetDetail = BackendAccreditationSet & {
	criteria: BackendRubricCriterion[];
	documents: BackendReferenceGuide[];
	dipakaiProyek: number;
};

/** `POST/PATCH .../criteria/replace-all` dan `.../duplicate` -- sertakan criteria, tanpa documents/dipakaiProyek. */
export type BackendAccreditationSetWithCriteria = BackendAccreditationSet & {
	criteria: BackendRubricCriterion[];
	documents?: BackendReferenceGuide[];
};

export type CreateAccreditationSetPayload = {
	nama: string;
	lembaga: string;
	tahunSiklus: number;
};

export type UpdateAccreditationSetPayload = Partial<CreateAccreditationSetPayload> & {
	status?: 'DRAF';
};

export type UpsertCriterionPayload = {
	indicatorNo: number;
	criterionCode: string;
	criterionGroup: string;
	description: string;
	scoreType: BackendScoreType;
	lkpsTableRefs: string[];
	formula?: string | null;
	subScoreFormula?: string | null;
	levels: { score: number; description: string }[];
	chapterOrders: number[];
};

/**
 * Client HTTP ke `apps/backend/src/accreditation-set` -- padanan
 * `led-project.remote-source.ts` untuk fitur ini. Bentuk baris di sini
 * mengikuti respons Prisma apa adanya; pemetaan ke `AccreditationSetEntity`
 * ada di `accreditation-set.repository.ts`, bukan di sini.
 */
export const accreditationSetRemoteSource = {
	findAll(): Promise<BackendAccreditationSetListItem[]> {
		return apiFetch<BackendAccreditationSetListItem[]>('/accreditation-sets');
	},

	findById(id: string): Promise<BackendAccreditationSetDetail> {
		return apiFetch<BackendAccreditationSetDetail>(`/accreditation-sets/${id}`);
	},

	create(payload: CreateAccreditationSetPayload): Promise<BackendAccreditationSet> {
		return apiFetch<BackendAccreditationSet>('/accreditation-sets', {
			method: 'POST',
			body: payload,
		});
	},

	update(
		id: string,
		payload: UpdateAccreditationSetPayload,
	): Promise<BackendAccreditationSet> {
		return apiFetch<BackendAccreditationSet>(`/accreditation-sets/${id}`, {
			method: 'PATCH',
			body: payload,
		});
	},

	markReady(id: string): Promise<BackendAccreditationSet> {
		return apiFetch<BackendAccreditationSet>(`/accreditation-sets/${id}/mark-ready`, {
			method: 'POST',
		});
	},

	remove(id: string): Promise<void> {
		return apiFetch<void>(`/accreditation-sets/${id}`, { method: 'DELETE' });
	},

	duplicate(id: string): Promise<BackendAccreditationSetWithCriteria> {
		return apiFetch<BackendAccreditationSetWithCriteria>(`/accreditation-sets/${id}/duplicate`, {
			method: 'POST',
		});
	},

	/** Menimpa SELURUH daftar kriteria set ini sekaligus -- lihat replace-criteria.dto.ts di backend. */
	replaceCriteria(
		id: string,
		criteria: UpsertCriterionPayload[],
	): Promise<BackendAccreditationSetWithCriteria> {
		return apiFetch<BackendAccreditationSetWithCriteria>(
			`/accreditation-sets/${id}/criteria/replace-all`,
			{ method: 'POST', body: { criteria } },
		);
	},

	removeCriterion(id: string, criterionId: string): Promise<void> {
		return apiFetch<void>(`/accreditation-sets/${id}/criteria/${criterionId}`, {
			method: 'DELETE',
		});
	},

	attachDocument(
		id: string,
		type: BackendDocumentType,
		payload: { fileKey: string; title: string },
	): Promise<BackendReferenceGuide> {
		return apiFetch<BackendReferenceGuide>(`/accreditation-sets/${id}/documents/${type}`, {
			method: 'PATCH',
			body: payload,
		});
	},

	removeDocument(id: string, type: BackendDocumentType): Promise<void> {
		return apiFetch<void>(`/accreditation-sets/${id}/documents/${type}`, {
			method: 'DELETE',
		});
	},
};
