import { apiFetch } from '~/core/lib/api-client';
import {
	type Jenjang,
	type PeringkatAkreditasi,
} from '../../../domain/entities/study-program.entity';

/** Bentuk baris Prisma `ProgramStudi` sebagaimana dikembalikan `/program-studi`. */
export type BackendProgramStudi = {
	id: string;
	tenantId: string;
	nama: string;
	kode: string;
	jenjang: Jenjang;
	fakultas: string;
	ketuaProdi: string;
	peringkatAkreditasi: PeringkatAkreditasi;
	nomorSkAkreditasi: string | null;
	berlakuSampaiAkreditasi: string | null;
	dibuatPada: string;
};

export type ProgramStudiPayload = {
	nama: string;
	kode: string;
	jenjang: Jenjang;
	fakultas: string;
	ketuaProdi: string;
	peringkatAkreditasi: PeringkatAkreditasi;
	nomorSkAkreditasi?: string;
	berlakuSampaiAkreditasi?: string;
};

export const studyProgramRemoteSource = {
	findAll(): Promise<BackendProgramStudi[]> {
		return apiFetch<BackendProgramStudi[]>('/program-studi');
	},

	findById(id: string): Promise<BackendProgramStudi> {
		return apiFetch<BackendProgramStudi>(`/program-studi/${id}`);
	},

	create(payload: ProgramStudiPayload): Promise<BackendProgramStudi> {
		return apiFetch<BackendProgramStudi>('/program-studi', {
			method: 'POST',
			body: payload,
		});
	},

	update(id: string, payload: Partial<ProgramStudiPayload>): Promise<BackendProgramStudi> {
		return apiFetch<BackendProgramStudi>(`/program-studi/${id}`, {
			method: 'PATCH',
			body: payload,
		});
	},

	remove(id: string): Promise<void> {
		return apiFetch<void>(`/program-studi/${id}`, { method: 'DELETE' });
	},
};
