import { apiFetch } from '~/core/lib/api-client';

/** Baris Prisma `BuktiDukungBab` — kondisi aktif, ditimpa tiap generate ulang. */
export type BackendBuktiDukungBab = {
	id: string;
	evidenceId: string;
	documentName: string;
	fileType: string;
};

/** Baris Prisma `BuktiDukungDraft` — permanen, menempel ke satu checkpoint. */
export type BackendBuktiDukungDraft = {
	id: string;
	evidenceId: string;
	documentName: string;
	fileType: string;
};

/** Baris Prisma `RagasScore`. */
export type BackendRagasScore = {
	id: string;
	targetType: 'BAB_AKTIF' | 'BAB_DRAFT';
	chapterId: string | null;
	chapterDraftId: string | null;
	/** `Record<RagasMetrik, number>` — lihat `worker.py::score_single_sample`. */
	metrics: Record<string, number>;
	chunkCount: number;
	computedAt: string;
};

/** Baris Prisma `CriterionScoreResult`. */
export type BackendHasilSkorKriteria = {
	id: string;
	criterionId: string;
	targetType: 'BAB_AKTIF' | 'BAB_DRAFT';
	chapterId: string | null;
	draftId: string | null;
	scoreObtained: number;
	justification: string | null;
	runByUserId: string;
	runByName: string;
	runAt: string;
};

/**
 * Bentuk baris Prisma `BabDokumen` sebagaimana dikembalikan `/dokumen/:id/bab`
 * dan `/bab/:id`. `buktiDukungBab`/`ragasScores`/`hasilSkorKriteria` hanya
 * di-`include` oleh `/bab/:id` (lihat `bab-dokumen.service.ts::findOne`) —
 * karenanya opsional di sini, dan kosong pada hasil `/dokumen/:id/bab`.
 */
export type BackendBabDokumen = {
	id: string;
	documentId: string;
	chapterOrder: number;
	chapterTitle: string;
	workingContent: Record<string, unknown>;
	activeCheckpointId: string | null;
	locked: boolean;
	qualityAssuranceNote: string | null;
	notedByName: string | null;
	notedAt: string | null;
	reviewSubmittedAt: string | null;
	lastSavedAt: string;
	buktiDukungBab?: BackendBuktiDukungBab[];
	/** Diurutkan terbaru dulu, dipotong ke satu baris — lihat `findOne`. */
	ragasScores?: BackendRagasScore[];
	/** Sudah disaring `targetTipe = 'BAB_AKTIF'` oleh backend. */
	hasilSkorKriteria?: BackendHasilSkorKriteria[];
};

/** Baris Prisma `BabDraft` — checkpoint, dikembalikan `GET bab/:id/drafts`. */
export type BackendBabDraft = {
	id: string;
	chapterId: string;
	createdByUserId: string;
	version: number;
	label: string | null;
	contentSnapshot: Record<string, unknown>;
	source: 'AI' | 'MANUAL';
	/** Comma-separated di Postgres (`@db.Text`) — lihat `chapter-draft.remote-source.ts`. */
	referenceChunkIds: string | null;
	createdByName: string;
	createdAt: string;
	buktiDukungDraft: BackendBuktiDukungDraft[];
	ragasScores: BackendRagasScore[];
	hasilSkorKriteria: BackendHasilSkorKriteria[];
};

/** Baris Prisma `RubricLevel`. */
export type BackendRubrikLevel = {
	id: string;
	criterionId: string;
	score: number;
	description: string;
};

/** Baris Prisma `RubricCriterion`, dikembalikan `GET bab/:id/rubrik`. */
export type BackendRubrikKriteria = {
	id: string;
	criterionCode: string;
	description: string;
	levels: BackendRubrikLevel[];
};

export type CreateBabPayload = {
	chapterOrder: number;
	chapterTitle: string;
};

export type UpdateBabPayload = {
	chapterTitle?: string;
	workingContent?: Record<string, unknown>;
};

export type ReviewStatusPayload = {
	locked?: boolean;
	qualityAssuranceNote?: string | null;
};

/** Baris `Job` (Prisma) sebagaimana dikembalikan `POST bab/:id/generate` dan `.../simulasi-skor`. */
export type BackendJob = {
	id: string;
	queueName: string;
	bullJobId: string;
	status: 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
};

/** Hasil job GENERASI_BAB (sekarang satu section) yang sudah selesai — lihat `worker.py::_handle_generasi_bab`. */
export type GenerasiBabResult = {
	status: 'completed' | 'error';
	sectionId?: string;
	babDraftId?: string;
	versi?: number;
	ragasScores?: Record<string, number>;
	error?: string;
};

/** Hasil job GENERASI_OUTLINE_BAB — lihat `worker.py::_handle_generasi_outline_bab`. */
export type GenerasiOutlineBabResult = {
	status: 'completed' | 'error';
	sectionCount?: number;
	error?: string;
};

/** Baris Prisma `ChapterSection` — outline (daftar section) yang di-generate LLM, dikembalikan `GET bab/:id/sections`. */
export type BackendChapterSection = {
	id: string;
	chapterId: string;
	parentId: string | null;
	order: number;
	title: string;
	guidance: string;
	status: 'PENDING' | 'GENERATING' | 'GENERATED' | 'ERROR';
	content: { format: string; body: string; markdown: string } | null;
	model: string | null;
	error: string | null;
	generatedAt: string | null;
};

/** Hasil job REKOMENDASI_DOKUMEN — lihat `worker.py::_handle_rekomendasi_dokumen`. */
export type RekomendasiDokumenResult = {
	status: 'completed' | 'error';
	recommendationId?: string;
	babDraftId?: string;
	lkpsNeeded?: boolean;
	itemCount?: number;
	error?: string;
};

/** Baris Prisma `RecommendationItem`. */
export type BackendRecommendationItem = {
	id: string;
	recommendationId: string;
	label: string;
	reason: string | null;
	order: number;
};

/**
 * Baris Prisma `DocumentRecommendation`. Hanya field yang dipakai frontend yang
 * dideklarasikan — lihat catatan yang sama di `document-recommendation.entity.ts`.
 */
export type BackendDocumentRecommendation = {
	id: string;
	chapterDraftId: string;
	recommendationText: string | null;
	/** `Json` di Prisma — larik id string. */
	selectedEvidenceIds: unknown;
	status: 'DIREKOMENDASIKAN' | 'DIKONFIRMASI' | 'DIGANTIKAN';
	/** Hanya di-`include` oleh `findRecommendation`, bukan hasil `confirmRecommendation`. */
	items?: BackendRecommendationItem[];
};

export const chapterRemoteSource = {
	findAllForDokumen(dokumenId: string): Promise<BackendBabDokumen[]> {
		return apiFetch<BackendBabDokumen[]>(`/dokumen/${dokumenId}/bab`);
	},

	/** Lintas prodi — Dashboard Utama KPI. */
	findAllForTenant(): Promise<BackendBabDokumen[]> {
		return apiFetch<BackendBabDokumen[]>('/bab');
	},

	findOne(id: string): Promise<BackendBabDokumen> {
		return apiFetch<BackendBabDokumen>(`/bab/${id}`);
	},

	/** Dipakai `led-project.repository.ts` untuk memateraikan 14 bab standar saat Dokumen LED baru dibuat. */
	create(dokumenId: string, payload: CreateBabPayload): Promise<BackendBabDokumen> {
		return apiFetch<BackendBabDokumen>(`/dokumen/${dokumenId}/bab`, {
			method: 'POST',
			body: payload,
		});
	},

	/**
	 * Memicu GENERASI_OUTLINE_BAB (Producer NestJS -> Worker FastAPI) — LLM
	 * menyusun daftar section (sub-bab), dituntun kelompok kriteria rubrik bab
	 * ini. `overwrite` mereset section yang sudah ada (v1: tanpa merge pintar).
	 */
	generateOutline(id: string, overwrite?: boolean): Promise<BackendJob> {
		return apiFetch<BackendJob>(`/bab/${id}/outline`, {
			method: 'POST',
			body: overwrite ? { overwrite: true } : {},
		});
	},

	/** Daftar section (outline) bab ini, terurut — kosong berarti outline belum pernah digenerate. */
	findSections(id: string): Promise<BackendChapterSection[]> {
		return apiFetch<BackendChapterSection[]>(`/bab/${id}/sections`);
	},

	/**
	 * Memicu GENERASI_BAB (Producer NestJS -> Worker FastAPI) untuk SATU section.
	 * `draftId` menamai checkpoint kosong dari alur rekomendasi yang sudah
	 * dikonfirmasi — worker lalu membatasi pencarian bukti dukungnya ke
	 * `selectedEvidenceIds` milik rekomendasi itu. Tanpa `draftId`, generate
	 * berjalan seperti biasa.
	 */
	generateSection(id: string, sectionId: string, prompt?: string, draftId?: string): Promise<BackendJob> {
		return apiFetch<BackendJob>(`/bab/${id}/sections/${sectionId}/generate`, {
			method: 'POST',
			body: {
				...(prompt ? { prompt } : {}),
				...(draftId ? { draftId } : {}),
			},
		});
	},

	/**
	 * Tambah section manual, langsung di akhir daftar (akhir sub-bab induknya
	 * kalau `parentId` diisi — jadi sub-sub-bab). Tanpa LLM/job.
	 */
	createSection(
		id: string,
		payload: { title: string; guidance: string; parentId?: string },
	): Promise<BackendChapterSection> {
		return apiFetch<BackendChapterSection>(`/bab/${id}/sections`, {
			method: 'POST',
			body: payload,
		});
	},

	/**
	 * Ubah section manual. `title`/`guidance` → backend reset status ke PENDING
	 * (konten lama basi, topiknya ganti). `content` → jalur BEDA (autosave
	 * kanvas section-view, `use-chapter-autosave.ts`): backend tulis langsung
	 * jadi `status: GENERATED`, tanpa mereset apa pun.
	 */
	updateSection(
		id: string,
		sectionId: string,
		payload: { title?: string; guidance?: string; content?: { format: 'html'; body: string } },
	): Promise<BackendChapterSection> {
		return apiFetch<BackendChapterSection>(`/bab/${id}/sections/${sectionId}`, {
			method: 'PATCH',
			body: payload,
		});
	},

	deleteSection(id: string, sectionId: string): Promise<void> {
		return apiFetch<void>(`/bab/${id}/sections/${sectionId}`, { method: 'DELETE' });
	},

	/** Memicu REKOMENDASI_DOKUMEN. `draftId` = "Rekomendasikan Ulang", memakai ulang draft kosong yang sama. */
	recommendDocuments(id: string, draftId?: string): Promise<BackendJob> {
		return apiFetch<BackendJob>(`/bab/${id}/recommend-documents`, {
			method: 'POST',
			body: draftId ? { draftId } : {},
		});
	},

	/**
	 * `draftId` diisi -> rekomendasi terbaru untuk checkpoint itu, apa pun
	 * statusnya (dipakai segera sesudah job REKOMENDASI_DOKUMEN selesai).
	 * Dikosongkan -> rekomendasi DIKONFIRMASI terbaru milik BAB ini (lepas
	 * dari draft mana yang jadi checkpoint aktif sekarang — lihat JSDoc
	 * `bab-pipeline.service.ts::findRecommendation`), atau `null` bila tidak ada.
	 */
	findRecommendation(
		id: string,
		draftId?: string,
	): Promise<BackendDocumentRecommendation | null> {
		const query = draftId ? `?draftId=${encodeURIComponent(draftId)}` : '';
		return apiFetch<BackendDocumentRecommendation | null>(
			`/bab/${id}/recommendation${query}`,
		);
	},

	/** Mengunci pilihan bukti dukung rekomendasi (status -> DIKONFIRMASI). */
	confirmRecommendation(
		id: string,
		payload: { recommendationId: string; selectedEvidenceIds: string[] },
	): Promise<BackendDocumentRecommendation> {
		return apiFetch<BackendDocumentRecommendation>(
			`/bab/${id}/recommend-documents/confirm`,
			{ method: 'POST', body: payload },
		);
	},

	/** Riwayat checkpoint bab ini, terbaru dulu — tab Draft/Rujukan/Kualitas AI/Rubrik. */
	findDrafts(id: string): Promise<BackendBabDraft[]> {
		return apiFetch<BackendBabDraft[]>(`/bab/${id}/drafts`);
	},

	/** Checkpoint manual — tombol "Simpan Draft" tab Draft. */
	createDraft(id: string, label: string | null): Promise<BackendBabDraft> {
		return apiFetch<BackendBabDraft>(`/bab/${id}/drafts`, {
			method: 'POST',
			body: label ? { label } : {},
		});
	},

	/** Kriteria rubrik LAM Teknik yang menilai bab ini. */
	findRubrik(id: string): Promise<BackendRubrikKriteria[]> {
		return apiFetch<BackendRubrikKriteria[]>(`/bab/${id}/rubrik`);
	},

	/** Memicu SIMULASI_SKOR. Tanpa `babDraftId` berarti menilai kondisi aktif. */
	simulateScore(id: string, babDraftId?: string): Promise<BackendJob> {
		return apiFetch<BackendJob>(`/bab/${id}/simulasi-skor`, {
			method: 'POST',
			body: babDraftId ? { chapterDraftId: babDraftId } : {},
		});
	},

	/** Autosave & edit judul. 403 saat bab terkunci, atau (Penyusun) sedang diajukan review. */
	update(id: string, payload: UpdateBabPayload): Promise<BackendBabDokumen> {
		return apiFetch<BackendBabDokumen>(`/bab/${id}`, {
			method: 'PATCH',
			body: payload,
		});
	},

	/** Ajukan review Penyusun; `diajukan: false` membatalkan (tombol "Batalkan Pengajuan"). */
	submitForReview(id: string, diajukan = true): Promise<BackendBabDokumen> {
		return apiFetch<BackendBabDokumen>(`/bab/${id}/submit-review`, {
			method: 'POST',
			body: { diajukan },
		});
	},

	/** Penjamin Mutu: kunci/buka bab dan/atau tulis catatan review. */
	setReviewStatus(id: string, payload: ReviewStatusPayload): Promise<BackendBabDokumen> {
		return apiFetch<BackendBabDokumen>(`/bab/${id}/review-status`, {
			method: 'PATCH',
			body: payload,
		});
	},

	/** Penjamin Mutu: hapus bab. */
	remove(id: string): Promise<void> {
		return apiFetch<void>(`/bab/${id}`, { method: 'DELETE' });
	},
};
