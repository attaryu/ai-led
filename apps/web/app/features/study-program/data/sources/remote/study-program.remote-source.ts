import { apiFetch } from '~/core/lib/api-client';
import { type Jenjang } from '../../../domain/entities/study-program.entity';

/** Bentuk baris Prisma `StudyProgram` sebagaimana dikembalikan `/program-studi`. */
export type BackendProgramStudi = {
	id: string;
	tenantId: string;
	name: string;
	code: string;
	level: Jenjang;
	faculty: string;
	programHead: string;
	createdAt: string;
};

export type ProgramStudiPayload = {
	name: string;
	code: string;
	level: Jenjang;
	faculty: string;
	programHead: string;
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
