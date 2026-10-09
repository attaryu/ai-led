import { apiFetch } from '~/core/lib/api-client';

/** Nilai `RubricScoreType` Prisma -- lihat packages/db/prisma/schema.prisma. */
export type BackendScoreType = 'KUALITATIF' | 'KUANTITATIF' | 'KOMPOSIT';

/** Nilai `AccreditationSetStatus` Prisma. */
export type BackendSetStatus = 'DRAF' | 'SIAP';

/** Nilai `StatusEkstraksi` Prisma -- dipakai ulang dari pipeline bukti dukung. */
export type BackendCriteriaParseStatus = 'MENUNGGU' | 'DIPROSES' | 'SIAP' | 'GAGAL';

/**
 * `StatusEkstraksi` Prisma juga, tapi hanya structureParseStatus pernah
 * benar-benar bernilai MENUNGGU_KONFIRMASI -- ekstraksi PANDUAN_LAM berhenti
 * dulu menunggu review user, criteriaParseStatus (DOKUMEN_RUBRIK) tidak
 * pernah lewat tahap itu, jadi typenya sengaja tidak disatukan.
 */
export type BackendStructureParseStatus = BackendCriteriaParseStatus | 'MENUNGGU_KONFIRMASI';

/** Nilai `TipePanduan` Prisma yang masih lewat slot `documents` 1:1 -- sama dengan `SetDocumentType` frontend (PANDUAN_LAM pindah ke endpoint /panduan, reusable). */
export type BackendDocumentType = 'DOKUMEN_RUBRIK';

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
	/** Sub-indikator ("I", "II", ...); `null` = tanpa sub. */
	subNo?: string | null;
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
	/** `null` = baris lama, diunggah sebelum kolom ini ada. */
	sizeBytes: number | null;
	uploadedByName: string | null;
	createdAt: string;
};

/** Panduan Penulisan (ReferenceGuide type=PANDUAN_LAM) -- baris `AccreditationSet.panduan`
 * penuh (findById) atau ringkas (findAll, cuma id+title). */
export type BackendSetPanduan = {
	id: string;
	title: string;
	structureParseStatus?: BackendStructureParseStatus;
	structureParseError?: string | null;
};

/** `GET /panduan` -- daftar Panduan tenant ini, lengkap dgn hitungan pemakaian. */
export type BackendPanduanListItem = {
	id: string;
	title: string;
	structureParseStatus: BackendStructureParseStatus;
	structureParseError: string | null;
	createdAt: string;
	jumlahBab: number;
	jumlahSetPemakai: number;
};

/** Baris Prisma `AccreditationSet` polos, seperti dikembalikan create/update/markReady. */
export type BackendAccreditationSet = {
	id: string;
	tenantId: string;
	nama: string;
	lembaga: string;
	tahunSiklus: number;
	status: BackendSetStatus;
	criteriaParseStatus: BackendCriteriaParseStatus;
	criteriaParseError: string | null;
	panduanId: string | null;
	createdAt: string;
	updatedAt: string;
};

/** Baris Prisma `SubBabTemplate`. */
export type BackendSubBabTemplate = {
	id: string;
	chapterTemplateId: string;
	parentId: string | null;
	order: number;
	title: string;
	/** Penomoran asli Panduan ("C.1", "a)") -- dimas marker. */
	marker: string | null;
	guidance: string;
	/** Toggle gap #2 -- matiin 1 sub-bab dari outline BARU tanpa re-extract, lihat panduan.controller.ts::toggleSection. */
	isActive: boolean;
	/** Anak bersarang sedalam apa pun -- accreditation-set.service.ts::findChapterTemplates. */
	children?: BackendSubBabTemplate[];
};

/** Baris Prisma `ChapterTemplate`, dengan `subBab` disertakan -- `GET /accreditation-sets/:id/chapter-templates`. */
export type BackendChapterTemplate = {
	id: string;
	guideId: string;
	order: number;
	title: string;
	/** Teks pengantar BAB (dimas: isi_teks baris BAB), `null` bila tidak ada. */
	guidance?: string | null;
	subBab: BackendSubBabTemplate[];
};

/** Satu node dari `GET /accreditation-sets/:id/structure/preview` -- lihat apps/ai's StructureNode (Pydantic). */
export type BackendStructureNode = {
	id: string;
	parent_id: string | null;
	/** 1 = BAB, lalu sedalam apa pun (tiap node Panduan jadi section, seperti dimas). */
	level: number;
	order: number;
	title: string;
	marker?: string | null;
	guidance: string | null;
	lkps_needed?: boolean;
	lkps_list?: string[];
	/** gap #2 -- cuma berarti utk node yang sudah commit, lihat structure.py::StructureNode. */
	is_active: boolean;
};

export type BackendStructurePreview = {
	status: string;
	nodes: BackendStructureNode[];
};

/** `GET /accreditation-sets` -- documents dipangkas ke `type`, criteria ke hitungannya (accreditation-set.service.ts::findAll). */
export type BackendAccreditationSetListItem = BackendAccreditationSet & {
	documents: { type: BackendDocumentType }[];
	panduan: { id: string; title: string } | null;
	_count: { criteria: number };
};

/** `GET /accreditation-sets/:id` -- detail penuh plus `dipakaiProyek` (accreditation-set.service.ts::toResponse). */
export type BackendAccreditationSetDetail = BackendAccreditationSet & {
	criteria: BackendRubricCriterion[];
	documents: BackendReferenceGuide[];
	panduan: BackendSetPanduan | null;
	dipakaiProyek: number;
};

/** `POST/PATCH .../criteria/replace-all` dan `.../duplicate` -- sertakan criteria, tanpa documents/dipakaiProyek. */
export type BackendAccreditationSetWithCriteria = BackendAccreditationSet & {
	criteria: BackendRubricCriterion[];
	documents?: BackendReferenceGuide[];
	panduan?: BackendSetPanduan | null;
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
	/** Sub-indikator; kosong = tanpa sub. */
	subNo?: string;
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

	/** Struktur bab/sub-bab resmi set ini -- kosong kalau belum pernah diekstrak. */
	findChapterTemplates(id: string): Promise<BackendChapterTemplate[]> {
		return apiFetch<BackendChapterTemplate[]>(`/accreditation-sets/${id}/chapter-templates`);
	},

	/** Pohon staged (MENUNGGU_KONFIRMASI) atau, kalau sudah commit, struktur nyata -- modal "Pilih Struktur Pedoman". */
	previewStructure(id: string): Promise<BackendStructurePreview> {
		return apiFetch<BackendStructurePreview>(`/accreditation-sets/${id}/structure/preview`);
	},

	/** Commit HANYA node yang tercentang; sisanya dibuang permanen. */
	confirmStructure(id: string, acceptedIds: string[]): Promise<{ guideId: string; count: number }> {
		return apiFetch<{ guideId: string; count: number }>(
			`/accreditation-sets/${id}/structure/confirm`,
			{ method: 'POST', body: { acceptedIds } },
		);
	},

	/** Pasang Panduan (baru diunggah ATAU sudah ada) ke set ini. */
	attachPanduan(id: string, panduanId: string): Promise<BackendAccreditationSet> {
		return apiFetch<BackendAccreditationSet>(`/accreditation-sets/${id}/panduan`, {
			method: 'PATCH',
			body: { panduanId },
		});
	},

	/** Lepas Panduan dari set ini -- baris Panduan-nya sendiri tidak ikut terhapus. */
	detachPanduan(id: string): Promise<void> {
		return apiFetch<void>(`/accreditation-sets/${id}/panduan`, { method: 'DELETE' });
	},

	/** Semua Panduan tenant ini -- dropdown "pilih existing". */
	listPanduan(): Promise<BackendPanduanListItem[]> {
		return apiFetch<BackendPanduanListItem[]>('/panduan');
	},

	/** Upload Panduan BARU (tenant-scoped, belum terpasang ke set manapun). */
	uploadPanduan(payload: { fileKey: string; title: string }): Promise<BackendPanduanListItem> {
		return apiFetch<BackendPanduanListItem>('/panduan', { method: 'POST', body: payload });
	},

	/** Re-upload KE Panduan yang sudah ada -- wipe+re-extract, mempengaruhi semua set yang menunjuknya. */
	replacePanduan(
		panduanId: string,
		payload: { fileKey: string; title: string },
	): Promise<BackendPanduanListItem> {
		return apiFetch<BackendPanduanListItem>(`/panduan/${panduanId}/replace`, {
			method: 'POST',
			body: payload,
		});
	},

	/** gap #2: nyala/matiin 1 sub-bab yang sudah commit dari outline baru. */
	toggleSection(subBabId: string, isActive: boolean): Promise<BackendSubBabTemplate> {
		return apiFetch<BackendSubBabTemplate>(`/panduan/sections/${subBabId}`, {
			method: 'PATCH',
			body: { isActive },
		});
	},

	/** Hapus Panduan permanen -- backend menolak (409) kalau masih dipakai Set manapun. */
	deletePanduan(panduanId: string): Promise<void> {
		return apiFetch<void>(`/panduan/${panduanId}`, { method: 'DELETE' });
	},
};
