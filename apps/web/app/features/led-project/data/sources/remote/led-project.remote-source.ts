import { apiFetch } from '~/core/lib/api-client';
import { type LedProjectStatus } from '../../../domain/entities/led-project.entity';

/** Bentuk baris Prisma `DokumenLed` sebagaimana dikembalikan `/program-studi/:id/dokumen` dan `/dokumen/:id`. */
export type BackendDokumenLed = {
	id: string;
	studyProgramId: string;
	title: string;
	academicYear: string;
	overallStatus: LedProjectStatus;
	deadline: string | null;
	createdAt: string;
};

export type DokumenLedCreatePayload = {
	title: string;
	academicYear: string;
	deadline?: string;
};

export type DokumenLedUpdatePayload = Partial<DokumenLedCreatePayload> & {
	overallStatus?: LedProjectStatus;
};

export const ledProjectRemoteSource = {
	findAllForProgramStudi(programStudiId: string): Promise<BackendDokumenLed[]> {
		return apiFetch<BackendDokumenLed[]>(`/program-studi/${programStudiId}/dokumen`);
	},

	/** Lintas prodi, satu request — dipakai Dashboard Utama (§4.0). */
	findAllForTenant(): Promise<BackendDokumenLed[]> {
		return apiFetch<BackendDokumenLed[]>('/dokumen');
	},

	findById(id: string): Promise<BackendDokumenLed> {
		return apiFetch<BackendDokumenLed>(`/dokumen/${id}`);
	},

	create(
		programStudiId: string,
		payload: DokumenLedCreatePayload,
	): Promise<BackendDokumenLed> {
		return apiFetch<BackendDokumenLed>(`/program-studi/${programStudiId}/dokumen`, {
			method: 'POST',
			body: payload,
		});
	},

	update(id: string, payload: DokumenLedUpdatePayload): Promise<BackendDokumenLed> {
		return apiFetch<BackendDokumenLed>(`/dokumen/${id}`, {
			method: 'PATCH',
			body: payload,
		});
	},

	remove(id: string): Promise<void> {
		return apiFetch<void>(`/dokumen/${id}`, { method: 'DELETE' });
	},
};
