import { apiFetch } from '~/core/lib/api-client';

/** Baris Prisma `BuktiDukungBab` — kondisi aktif, ditimpa tiap generate ulang. */
export type BackendBuktiDukungBab = {
	id: string;
	buktiDukungId: string;
	namaDokumen: string;
	tipeFile: string;
};

/** Baris Prisma `BuktiDukungDraft` — permanen, menempel ke satu checkpoint. */
export type BackendBuktiDukungDraft = {
	id: string;
	buktiDukungId: string;
	namaDokumen: string;
	tipeFile: string;
};

/** Baris Prisma `RagasScore`. */
export type BackendRagasScore = {
	id: string;
	targetTipe: 'BAB_AKTIF' | 'BAB_DRAFT';
	babId: string | null;
	babDraftId: string | null;
	/** `Record<RagasMetrik, number>` — lihat `worker.py::score_single_sample`. */
	metrik: Record<string, number>;
	jumlahChunk: number;
	dihitungPada: string;
};

/** Baris Prisma `HasilSkorKriteria`. */
export type BackendHasilSkorKriteria = {
	id: string;
	kriteriaId: string;
	targetTipe: 'BAB_AKTIF' | 'BAB_DRAFT';
	babId: string | null;
	babDraftId: string | null;
	skorDidapat: number;
	justifikasi: string | null;
	dijalankanOlehUserId: string;
	dijalankanOlehNama: string;
	dijalankanPada: string;
};

/**
 * Bentuk baris Prisma `BabDokumen` sebagaimana dikembalikan `/dokumen/:id/bab`
 * dan `/bab/:id`. `buktiDukungBab`/`ragasScores`/`hasilSkorKriteria` hanya
 * di-`include` oleh `/bab/:id` (lihat `bab-dokumen.service.ts::findOne`) —
 * karenanya opsional di sini, dan kosong pada hasil `/dokumen/:id/bab`.
 */
export type BackendBabDokumen = {
	id: string;
	dokumenId: string;
	urutanBab: number;
	judulBab: string;
	kontenKerja: Record<string, unknown>;
	checkpointAktifId: string | null;
	terkunci: boolean;
	catatanPenjaminMutu: string | null;
	catatanOlehNama: string | null;
	catatanPada: string | null;
	diajukanReviewPada: string | null;
	terakhirDisimpan: string;
	buktiDukungBab?: BackendBuktiDukungBab[];
	/** Diurutkan terbaru dulu, dipotong ke satu baris — lihat `findOne`. */
	ragasScores?: BackendRagasScore[];
	/** Sudah disaring `targetTipe = 'BAB_AKTIF'` oleh backend. */
	hasilSkorKriteria?: BackendHasilSkorKriteria[];
};

/** Baris Prisma `BabDraft` — checkpoint, dikembalikan `GET bab/:id/drafts`. */
export type BackendBabDraft = {
	id: string;
	babId: string;
	dibuatOlehUserId: string;
	versi: number;
	label: string | null;
	kontenSnapshot: Record<string, unknown>;
	sumber: 'AI' | 'MANUAL';
	/** Comma-separated di Postgres (`@db.Text`) — lihat `chapter-draft.remote-source.ts`. */
	referensiChunkIds: string | null;
	dibuatOlehNama: string;
	dibuatPada: string;
	buktiDukungDraft: BackendBuktiDukungDraft[];
	ragasScores: BackendRagasScore[];
	hasilSkorKriteria: BackendHasilSkorKriteria[];
};

/** Baris Prisma `RubrikLevel`. */
export type BackendRubrikLevel = {
	id: string;
	kriteriaId: string;
	skor: number;
	deskripsi: string;
};

/** Baris Prisma `RubrikKriteria`, dikembalikan `GET bab/:id/rubrik`. */
export type BackendRubrikKriteria = {
	id: string;
	kodeKriteria: string;
	deskripsi: string;
	level: BackendRubrikLevel[];
};

export type CreateBabPayload = {
	urutanBab: number;
	judulBab: string;
};

export type UpdateBabPayload = {
	judulBab?: string;
	kontenKerja?: Record<string, unknown>;
};

export type ReviewStatusPayload = {
	terkunci?: boolean;
	catatanPenjaminMutu?: string | null;
};

/** Baris `Job` (Prisma) sebagaimana dikembalikan `POST bab/:id/generate` dan `.../simulasi-skor`. */
export type BackendJob = {
	id: string;
	queueName: string;
	bullJobId: string;
	status: 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
};

/** Hasil job GENERASI_BAB yang sudah selesai — lihat `worker.py::_handle_generasi_bab`. */
export type GenerasiBabResult = {
	status: 'completed' | 'error';
	babDraftId?: string;
	versi?: number;
	ragasScores?: Record<string, number>;
	error?: string;
};

export const chapterRemoteSource = {
	findAllForDokumen(dokumenId: string): Promise<BackendBabDokumen[]> {
		return apiFetch<BackendBabDokumen[]>(`/dokumen/${dokumenId}/bab`);
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

	/** Memicu GENERASI_BAB (Producer NestJS -> Worker FastAPI). */
	generate(id: string, prompt?: string): Promise<BackendJob> {
		return apiFetch<BackendJob>(`/bab/${id}/generate`, {
			method: 'POST',
			body: prompt ? { prompt } : {},
		});
	},

	/** Riwayat checkpoint bab ini, terbaru dulu — tab Draft/Rujukan/Kualitas AI/Rubrik. */
	findDrafts(id: string): Promise<BackendBabDraft[]> {
		return apiFetch<BackendBabDraft[]>(`/bab/${id}/drafts`);
	},

	/** Kriteria rubrik LAM Teknik yang menilai bab ini. */
	findRubrik(id: string): Promise<BackendRubrikKriteria[]> {
		return apiFetch<BackendRubrikKriteria[]>(`/bab/${id}/rubrik`);
	},

	/** Memicu SIMULASI_SKOR. Tanpa `babDraftId` berarti menilai kondisi aktif. */
	simulateScore(id: string, babDraftId?: string): Promise<BackendJob> {
		return apiFetch<BackendJob>(`/bab/${id}/simulasi-skor`, {
			method: 'POST',
			body: babDraftId ? { babDraftId } : {},
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
