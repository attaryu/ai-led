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
	/**
	 * `Record<RagasMetrik, {nilai, alasan}>` — lihat
	 * `worker.py::_judge_to_ragas_metrics`. Baris lama (sebelum skor ini
	 * dihitung LLM-as-judge) masih bisa berupa `Record<RagasMetrik, number>`
	 * polos — `mapRagas` menangani keduanya.
	 */
	metrics: Record<string, number | { nilai: number; alasan: string }>;
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
	/** Hanya pada `GET /dokumen/:id/bab`; backend lama tidak mengirimnya. */
	sections?: BackendSectionOverview[];
};

/** Ringkasan sub-bab pada daftar bab satu dokumen (tanpa konten/panduan). */
export type BackendSectionOverview = {
	id: string;
	parentId: string | null;
	order: number;
	title: string;
	marker: string | null;
	status: 'PENDING' | 'GENERATING' | 'GENERATED' | 'ERROR';
	error: string | null;
	locked: boolean;
	reviewSubmittedAt: string | null;
	qualityAssuranceNote: string | null;
	notedByName: string | null;
	notedAt: string | null;
};

/** Baris Prisma `SectionDraft` — checkpoint per-section, dikembalikan `GET bab/:id/sections/:sectionId/drafts`. Lebih tipis dari `BackendBabDraft`: tidak ada arsip bukti dukung/ragas per checkpoint. */
export type BackendSectionDraft = {
	id: string;
	sectionId: string;
	createdByUserId: string;
	version: number;
	label: string | null;
	source: 'AI' | 'MANUAL';
	createdByName: string;
	createdAt: string;
	/** Isi versi ini (dokumen ProseMirror) -- dipakai pratinjau baca-saja. */
	contentSnapshot?: unknown;
	/** Versi yang sekarang jadi isi section (bab-draft.service.ts::findSectionDrafts). */
	isActive?: boolean;
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
	ragasScores?: Record<string, { nilai: number; alasan: string }>;
	error?: string;
	/** Terisi kalau tahap checklist (LLM) gagal 2x -- section ini digenerate TANPA panduan pencarian fakta. */
	checklistError?: string;
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
	marker: string | null;
	guidance: string;
	lkpsNeeded: boolean | null;
	lkpsList: string[] | null;
	status: 'PENDING' | 'GENERATING' | 'GENERATED' | 'ERROR';
	/** Dokumen ProseMirror; baris lama `{format, body, markdown}` masih mungkin muncul. */
	content: Record<string, unknown> | null;
	tableSpec: { id: string; caption: string; columns: string[] }[] | null;
	model: string | null;
	error: string | null;
	generatedAt: string | null;
	locked: boolean;
	qualityAssuranceNote: string | null;
	notedByName: string | null;
	notedAt: string | null;
	reviewSubmittedAt: string | null;
};

/**
 * Satu elemen `GenerationRun.chunksUsed` (Json bebas bentuk) — field lain yang
 * disimpan worker.py (`chunk_id`, `metadata`, `entity`, dst) sengaja tidak
 * dideklarasikan di sini karena tidak pernah dibaca frontend.
 */
export type BackendChunkUsed = {
	citation_label: string;
	kind: 'led' | 'evidence' | 'lkps';
	text: string;
	/** R2 object key (bukan URL siap-pakai) -- `null` utk chunk `kind: 'led'` atau evidence yang sudah dihapus. */
	fileUrl: string | null;
	/** Evidence asal chunk `kind: 'evidence'` (worker.py search_evidence). */
	bukti_dukung_id?: string;
	/** Judul bagian/heading chunk evidence (tab Bukti); tidak ada pada chunk LKPS/LED. */
	entity?: string;
};

/** `GET bab/:id/sections/:sectionId/sumber` — `null` = section belum pernah digenerate lewat job ini. */
export type BackendSectionSumber = {
	chunksUsed: BackendChunkUsed[];
	generatedAt: string;
	/** Bukti dukung yang dipilih saat generate terakhir section ini. */
	selectedEvidenceIds?: string[];
	/** worker.py judge output: 4 metrik + `reasoning`, atau `{error}`. */
	judgeResult?: Record<string, unknown> | null;
	latencySec?: number | null;
	model?: string | null;
	/** Butir checklist pencarian fakta generate terakhir (`_SYSTEM_CHECKLIST`). */
	checklist?: string[];
	/** Terisi bila tahap checklist gagal 2x -- section digenerate tanpa panduan pencarian fakta. */
	checklistError?: string | null;
} | null;

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
	status: 'DIREKOMENDASIKAN' | 'DIGUNAKAN' | 'TIDAK_DIPERLUKAN';
};

/**
 * Baris Prisma `DocumentRecommendation`. Hanya field yang dipakai frontend yang
 * dideklarasikan — lihat catatan yang sama di `document-recommendation.entity.ts`.
 */
export type BackendDocumentRecommendation = {
	id: string;
	chapterDraftId: string;
	chapterSectionId: string | null;
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

	/** Chunk asli yang dipakai AI menyusun satu section — backing citation hover-card. */
	findSourcesForSection(id: string, sectionId: string): Promise<BackendSectionSumber> {
		return apiFetch<BackendSectionSumber>(`/bab/${id}/sections/${sectionId}/sumber`);
	},

	/** Memicu GENERASI_BAB untuk SATU section. `draftId` (rekomendasi terkonfirmasi) mengalahkan `selectedEvidenceIds` (picker manual). */
	generateSection(
		id: string,
		sectionId: string,
		prompt?: string,
		draftId?: string,
		selectedEvidenceIds?: string[],
	): Promise<BackendJob> {
		return apiFetch<BackendJob>(`/bab/${id}/sections/${sectionId}/generate`, {
			method: 'POST',
			body: {
				...(prompt ? { prompt } : {}),
				...(draftId ? { draftId } : {}),
				...(selectedEvidenceIds && selectedEvidenceIds.length > 0 ? { selectedEvidenceIds } : {}),
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
		payload: {
			title?: string;
			guidance?: string;
			content?: Record<string, unknown>;
			tableSpec?: { id: string; caption: string; columns: string[] }[];
		},
	): Promise<BackendChapterSection> {
		return apiFetch<BackendChapterSection>(`/bab/${id}/sections/${sectionId}`, {
			method: 'PATCH',
			body: payload,
		});
	},

	deleteSection(id: string, sectionId: string): Promise<void> {
		return apiFetch<void>(`/bab/${id}/sections/${sectionId}`, { method: 'DELETE' });
	},

	/** Memicu penilaian RAGAS satu section (job PENILAIAN_RAGAS) -- tombol di tab Kualitas AI. */
	evaluateQuality(id: string, sectionId: string): Promise<BackendJob> {
		return apiFetch<BackendJob>(`/bab/${id}/sections/${sectionId}/evaluate-quality`, { method: 'POST' });
	},

	/** Memicu REKOMENDASI_DOKUMEN. `draftId` = "Rekomendasikan Ulang", memakai ulang draft kosong yang sama. */
	recommendDocuments(id: string, draftId?: string, sectionId?: string): Promise<BackendJob> {
		return apiFetch<BackendJob>(`/bab/${id}/recommend-documents`, {
			method: 'POST',
			body: { ...(draftId ? { draftId } : {}), ...(sectionId ? { sectionId } : {}) },
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
		sectionId?: string,
	): Promise<BackendDocumentRecommendation | null> {
		const params = new URLSearchParams();
		if (draftId) params.set('draftId', draftId);
		if (sectionId) params.set('sectionId', sectionId);
		const query = params.size ? `?${params}` : '';
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

	/** Checkpoint AI bab (`ChapterDraft`) — tab Rujukan/Kualitas AI/Rubrik, read-only. */
	findDrafts(id: string): Promise<BackendBabDraft[]> {
		return apiFetch<BackendBabDraft[]>(`/bab/${id}/drafts`);
	},

	/** Riwayat checkpoint section ini, terbaru dulu — tab Draft di editor section. */
	findSectionDrafts(id: string, sectionId: string): Promise<BackendSectionDraft[]> {
		return apiFetch<BackendSectionDraft[]>(`/bab/${id}/sections/${sectionId}/drafts`);
	},

	/** Checkpoint manual — tombol "Simpan Draft" tab Draft. */
	createSectionDraft(
		id: string,
		sectionId: string,
		label: string | null,
	): Promise<BackendSectionDraft> {
		return apiFetch<BackendSectionDraft>(`/bab/${id}/sections/${sectionId}/drafts`, {
			method: 'POST',
			body: label ? { label } : {},
		});
	},

	/** Pulihkan section ke isi salah satu checkpoint-nya — mengembalikan section yang sudah diperbarui. */
	restoreSectionDraft(
		id: string,
		sectionId: string,
		draftId: string,
	): Promise<BackendChapterSection> {
		return apiFetch<BackendChapterSection>(
			`/bab/${id}/sections/${sectionId}/drafts/${draftId}/restore`,
			{ method: 'POST' },
		);
	},

	/** Simpan centang bukti dukung section (replace penuh). */
	updateSectionEvidenceSelection(
		id: string,
		sectionId: string,
		evidenceIds: string[],
	): Promise<{ selectedEvidenceIds: string[] }> {
		return apiFetch<{ selectedEvidenceIds: string[] }>(
			`/bab/${id}/sections/${sectionId}/evidence-selection`,
			{ method: 'PUT', body: { evidenceIds } },
		);
	},

	/** Hapus satu checkpoint dari Riwayat Draft section (204, tanpa isi balikan). */
	deleteSectionDraft(id: string, sectionId: string, draftId: string): Promise<void> {
		return apiFetch<void>(`/bab/${id}/sections/${sectionId}/drafts/${draftId}`, {
			method: 'DELETE',
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
	submitForReview(id: string, sectionId: string, diajukan = true): Promise<BackendChapterSection> {
		return apiFetch<BackendChapterSection>(`/bab/${id}/sections/${sectionId}/submit-review`, {
			method: 'POST',
			body: { diajukan },
		});
	},

	/** Penjamin Mutu: kunci/buka section dan/atau tulis catatan review. */
	setReviewStatus(
		id: string,
		sectionId: string,
		payload: ReviewStatusPayload,
	): Promise<BackendChapterSection> {
		return apiFetch<BackendChapterSection>(`/bab/${id}/sections/${sectionId}/review-status`, {
			method: 'PATCH',
			body: payload,
		});
	},

	/** Penjamin Mutu: hapus bab. */
	remove(id: string): Promise<void> {
		return apiFetch<void>(`/bab/${id}`, { method: 'DELETE' });
	},
};
