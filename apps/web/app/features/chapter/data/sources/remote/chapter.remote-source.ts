import { apiFetch } from '~/core/lib/api-client';

/** Bentuk baris Prisma `BabDokumen` sebagaimana dikembalikan `/dokumen/:id/bab` dan `/bab/:id`. */
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
};

export type CreateBabPayload = {
	urutanBab: number;
	judulBab: string;
};

/** Baris `Job` (Prisma) sebagaimana dikembalikan `POST bab/:id/generate`. */
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
};
