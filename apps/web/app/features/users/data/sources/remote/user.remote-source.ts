import { apiFetch } from '~/core/lib/api-client';
import { type BackendRole, type BackendUser } from '~/features/auth/data/sources/remote/auth.remote-source';

/** `GET /users` meng-include nama prodi, tidak seperti bentuk `/auth/*`. */
export type BackendUserWithProdi = BackendUser & {
	studyProgram: { name: string } | null;
};

export type CreateUserPayload = {
	fullName: string;
	email: string;
	password: string;
	role: BackendRole;
	studyProgramId?: string;
};

/** Semua field opsional — server yang memutuskan mana yang boleh diisi per role. */
export type UpdateUserPayload = {
	fullName?: string;
	email?: string;
	password?: string;
	role?: BackendRole;
	studyProgramId?: string;
};

export const userRemoteSource = {
	findAll(): Promise<BackendUserWithProdi[]> {
		return apiFetch<BackendUserWithProdi[]>('/users');
	},

	/** Penyusun satu prodi; Penjamin Mutu, Pimpinan, dan Admin boleh memanggilnya. */
	findPenyusunByStudyProgramId(studyProgramId: string): Promise<BackendUserWithProdi[]> {
		return apiFetch<BackendUserWithProdi[]>(
			`/users/penyusun?programStudiId=${encodeURIComponent(studyProgramId)}`,
		);
	},

	create(payload: CreateUserPayload): Promise<BackendUser> {
		return apiFetch<BackendUser>('/users', { method: 'POST', body: payload });
	},

	update(id: string, payload: UpdateUserPayload): Promise<BackendUser> {
		return apiFetch<BackendUser>(`/users/${id}`, { method: 'PATCH', body: payload });
	},

	remove(id: string): Promise<void> {
		return apiFetch<void>(`/users/${id}`, { method: 'DELETE' });
	},
};
