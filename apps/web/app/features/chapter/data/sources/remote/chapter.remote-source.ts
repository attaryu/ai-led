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
};
