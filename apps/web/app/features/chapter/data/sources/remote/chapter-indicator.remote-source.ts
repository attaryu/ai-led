import { apiFetch } from '~/core/lib/api-client';
import {
	type HasilIkuSetor,
	type IkuPayload,
	type IndikatorSection,
} from '../../../domain/entities/indicator-assessment.entity';

type BackendIndikator = {
	id: string;
	kode: string;
	no: number;
	subNo: string;
	deskripsi: string;
	tipeSkor: string;
};

/** `GET /jobs/:id` untuk job SETOR_LED — lihat docs/setor-led-api.md §2–3. */
export type SetorLedJob = {
	id: string;
	status: 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
	progress?: number | { completed: number; total: number };
	result: { status: 'completed' | 'cancelled' | 'error'; hasil?: HasilIkuSetor[]; error?: string } | null;
	error: string | null;
};

export const chapterIndicatorRemoteSource = {
	/** Indikator matriks penilaian yang dipetakan ke section ini (kosong = tidak ada pemetaan). */
	async findIndikator(babId: string, sectionId: string): Promise<IndikatorSection[]> {
		const rows = await apiFetch<BackendIndikator[]>(`/bab/${babId}/sections/${sectionId}/indikator`);
		return rows.map((r) => ({ id: r.id, kode: r.kode, deskripsi: r.deskripsi }));
	},

	/** Memulai job SETOR_LED; `dokumenId` = id Dokumen LED (bukan bab). Mengembalikan baris Job. */
	startSetorLed(dokumenId: string, ikuList: IkuPayload[]): Promise<{ id: string }> {
		return apiFetch<{ id: string }>(`/dokumen/${dokumenId}/setor-led`, {
			method: 'POST',
			body: { ikuList, sumberLed: 'EDITOR' },
		});
	},

	getJob(jobId: string): Promise<SetorLedJob> {
		return apiFetch<SetorLedJob>(`/jobs/${jobId}`);
	},
};
