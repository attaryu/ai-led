import {
	type RubricCriterion,
	type RubricScoreType,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';
import {
	type AccreditationSetDocument,
	type AccreditationSetEntity,
	type PanduanLibraryItem,
	type SetDocumentType,
	type SetPanduan,
} from '../domain/entities/accreditation-set.entity';
import { type ChapterTemplateEntity } from '../domain/entities/chapter-template.entity';
import { type StructurePreviewEntity } from '../domain/entities/structure-preview.entity';
import {
	type BackendAccreditationSet,
	type BackendAccreditationSetDetail,
	type BackendAccreditationSetListItem,
	type BackendAccreditationSetWithCriteria,
	type BackendChapterTemplate,
	type BackendDocumentType,
	type BackendPanduanListItem,
	type BackendReferenceGuide,
	type BackendRubricCriterion,
	type BackendScoreType,
	type BackendSetPanduan,
	type BackendStructurePreview,
	type BackendSubBabTemplate,
	type UpsertCriterionPayload,
} from './sources/remote/accreditation-set.remote-source';

const SCORE_TYPE_TO_FRONTEND: Record<BackendScoreType, RubricScoreType> = {
	KUALITATIF: 'kualitatif',
	KUANTITATIF: 'kuantitatif',
	KOMPOSIT: 'komposit',
};

const SCORE_TYPE_TO_BACKEND: Record<RubricScoreType, BackendScoreType> = {
	kualitatif: 'KUALITATIF',
	kuantitatif: 'KUANTITATIF',
	komposit: 'KOMPOSIT',
};

export function mapCriterion(row: BackendRubricCriterion): RubricCriterion {
	return {
		id: row.id,
		no: row.indicatorNo,
		subNo: row.subNo ?? '',
		kodeKriteria: row.criterionCode,
		kriteria: row.criterionGroup,
		deskripsi: row.description,
		tipeSkor: SCORE_TYPE_TO_FRONTEND[row.scoreType],
		tabelLkps: row.lkpsTableRefs,
		levelSkor: row.levels.map((l) => ({ skor: l.score, deskripsi: l.description })),
		urutanBab: row.criterionChapters.map((c) => c.chapterOrder),
		formula: row.formula,
		subScoreFormula: row.subScoreFormula,
	};
}

/** `RubricCriterion` (dengan atau tanpa `id`) -> body `POST .../criteria/replace-all`. */
export function toCriterionPayload(
	kriteria: Omit<RubricCriterion, 'id'>,
): UpsertCriterionPayload {
	return {
		indicatorNo: kriteria.no,
		subNo: kriteria.subNo || undefined,
		criterionCode: kriteria.kodeKriteria,
		criterionGroup: kriteria.kriteria,
		description: kriteria.deskripsi,
		scoreType: SCORE_TYPE_TO_BACKEND[kriteria.tipeSkor],
		lkpsTableRefs: kriteria.tabelLkps,
		formula: kriteria.formula ?? null,
		subScoreFormula: kriteria.subScoreFormula ?? null,
		levels: kriteria.levelSkor.map((l) => ({ score: l.skor, description: l.deskripsi })),
		chapterOrders: kriteria.urutanBab,
	};
}

/**
 * `ReferenceGuide` -> `AccreditationSetDocument`.
 *
 * `sizeBytes`/`uploadedByName` bisa `null` untuk baris yang diunggah sebelum
 * kolom ini ada di `ReferenceGuide` (packages/db) -- ditampilkan sebagai
 * "(tidak tercatat)"/0 B, sama seperti gap lama, tapi kini cuma untuk baris
 * lama itu, bukan semua baris.
 */
export function mapDocument(row: BackendReferenceGuide): AccreditationSetDocument {
	return {
		tipe: row.type,
		namaBerkas: row.title,
		tipeBerkas: row.fileType,
		ukuranBytes: row.sizeBytes ?? 0,
		diunggahPada: row.createdAt,
		diunggahOleh: row.uploadedByName ?? '(tidak tercatat)',
	};
}

/** `null` -> `null` (set belum punya Panduan), lengkap atau ringkas (list vs detail) -> `SetPanduan`. */
function mapPanduan(row: BackendSetPanduan | null): SetPanduan | null {
	if (!row) return null;
	return {
		id: row.id,
		judul: row.title,
		// Ringkas (BackendAccreditationSetListItem.panduan, cuma id+title) tidak
		// bawa status -- badge/banner ekstraksi cuma dirender di halaman detail,
		// jadi placeholder di sini aman, tidak pernah dibaca dari baris list.
		structureParseStatus: row.structureParseStatus ?? 'SIAP',
		structureParseError: row.structureParseError ?? null,
	};
}

type AnyBackendSet =
	| BackendAccreditationSet
	| BackendAccreditationSetDetail
	| BackendAccreditationSetWithCriteria;

/**
 * Baris `AccreditationSet` apa pun (polos, detail, atau dengan criteria saja)
 * -> entity penuh. `dokumen`/`kriteria` yang tidak disertakan respons
 * (create/update/markReady) jadi larik kosong -- aman, karena tidak ada
 * pemanggil yang membaca isinya dari method-method itu (semua memuat ulang
 * lewat `findById` setelahnya).
 */
export function toEntity(row: AnyBackendSet): AccreditationSetEntity {
	const criteria = 'criteria' in row ? row.criteria : [];
	const documents = 'documents' in row && row.documents ? row.documents : [];
	// create/update/markReady (bare BackendAccreditationSet) tidak nge-include
	// relasi `panduan`, cuma scalar `panduanId` -- pemanggilnya semua langsung
	// findById ulang sesudahnya, jadi null di sini tidak pernah benar-benar dibaca.
	const panduan = 'panduan' in row ? row.panduan : null;

	return {
		id: row.id,
		nama: row.nama,
		lembaga: row.lembaga,
		tahunSiklus: row.tahunSiklus,
		status: row.status,
		dokumen: documents.map(mapDocument),
		panduan: mapPanduan(panduan ?? null),
		kriteria: criteria.map(mapCriterion),
		criteriaParseStatus: row.criteriaParseStatus,
		criteriaParseError: row.criteriaParseError,
		createdAt: row.createdAt,
	};
}

/**
 * `GET /accreditation-sets` (list) -> entity buat tabel manajemen.
 *
 * `documents` di sini cuma `{type}` (accreditation-set.service.ts::findAll) --
 * cukup untuk `deriveSetCompleteness` (cuma baca `.tipe`), jadi field lain
 * diisi placeholder yang TIDAK PERNAH dirender kolom daftar mana pun.
 * `kriteria` cuma perlu `.length` (accreditation-set-columns.tsx "Isi
 * Rubrik") -- larik jarang (`new Array(n)`) memberi `.length` yang benar
 * tanpa memalsukan n baris kriteria yang tidak pernah dibaca isinya.
 */
export function toListEntity(row: BackendAccreditationSetListItem): AccreditationSetEntity {
	const dokumenPlaceholder = (tipe: SetDocumentType): AccreditationSetDocument => ({
		tipe,
		namaBerkas: '',
		tipeBerkas: '',
		ukuranBytes: 0,
		diunggahPada: '',
		diunggahOleh: '',
	});

	return {
		id: row.id,
		nama: row.nama,
		lembaga: row.lembaga,
		tahunSiklus: row.tahunSiklus,
		status: row.status,
		dokumen: row.documents.map((d) => dokumenPlaceholder(d.type as SetDocumentType)),
		panduan: mapPanduan(row.panduan),
		kriteria: new Array(row._count.criteria) as RubricCriterion[],
		criteriaParseStatus: row.criteriaParseStatus,
		criteriaParseError: row.criteriaParseError,
		createdAt: row.createdAt,
	};
}

export function mapChapterTemplate(row: BackendChapterTemplate): ChapterTemplateEntity {
	return {
		id: row.id,
		urutan: row.order,
		judul: row.title,
		pengantar: row.guidance ?? null,
		subBab: row.subBab.map(mapSubBabTemplate),
	};
}

function mapSubBabTemplate(s: BackendSubBabTemplate): ChapterTemplateEntity['subBab'][number] {
	return {
		id: s.id,
		urutan: s.order,
		judul: s.title,
		marker: s.marker ?? null,
		panduan: s.guidance,
		aktif: s.isActive,
		anak: (s.children ?? []).map(mapSubBabTemplate),
	};
}

export function mapPanduanLibraryItem(row: BackendPanduanListItem): PanduanLibraryItem {
	return {
		id: row.id,
		judul: row.title,
		structureParseStatus: row.structureParseStatus,
		structureParseError: row.structureParseError,
		createdAt: row.createdAt,
		jumlahBab: row.jumlahBab,
		jumlahSetPemakai: row.jumlahSetPemakai,
	};
}

export function mapStructurePreview(row: BackendStructurePreview): StructurePreviewEntity {
	return {
		status: row.status,
		nodes: row.nodes.map((n) => ({
			id: n.id,
			parentId: n.parent_id,
			level: n.level,
			order: n.order,
			title: n.title,
			marker: n.marker ?? null,
			guidance: n.guidance,
			lkpsDibutuhkan: n.lkps_needed ?? false,
			tabelLkps: n.lkps_list ?? [],
			isActive: n.is_active,
		})),
	};
}

export type { BackendDocumentType };
