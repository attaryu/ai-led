import {
	type RubricCriterion,
	type RubricScoreType,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';
import {
	type AccreditationSetDocument,
	type AccreditationSetEntity,
	type SetDocumentType,
} from '../domain/entities/accreditation-set.entity';
import { type ChapterTemplateEntity } from '../domain/entities/chapter-template.entity';
import {
	type BackendAccreditationSet,
	type BackendAccreditationSetDetail,
	type BackendAccreditationSetListItem,
	type BackendAccreditationSetWithCriteria,
	type BackendChapterTemplate,
	type BackendDocumentType,
	type BackendReferenceGuide,
	type BackendRubricCriterion,
	type BackendScoreType,
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

	return {
		id: row.id,
		nama: row.nama,
		lembaga: row.lembaga,
		tahunSiklus: row.tahunSiklus,
		status: row.status,
		dokumen: documents.map(mapDocument),
		kriteria: criteria.map(mapCriterion),
		criteriaParseStatus: row.criteriaParseStatus,
		criteriaParseError: row.criteriaParseError,
		structureParseStatus: row.structureParseStatus,
		structureParseError: row.structureParseError,
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
		kriteria: new Array(row._count.criteria) as RubricCriterion[],
		criteriaParseStatus: row.criteriaParseStatus,
		criteriaParseError: row.criteriaParseError,
		structureParseStatus: row.structureParseStatus,
		structureParseError: row.structureParseError,
		createdAt: row.createdAt,
	};
}

export function mapChapterTemplate(row: BackendChapterTemplate): ChapterTemplateEntity {
	return {
		id: row.id,
		urutan: row.order,
		judul: row.title,
		subBab: row.subBab.map(mapSubBabTemplate),
	};
}

function mapSubBabTemplate(s: BackendSubBabTemplate): ChapterTemplateEntity['subBab'][number] {
	return {
		id: s.id,
		urutan: s.order,
		judul: s.title,
		panduan: s.guidance,
		anak: (s.children ?? []).map(mapSubBabTemplate),
	};
}

export type { BackendDocumentType };
