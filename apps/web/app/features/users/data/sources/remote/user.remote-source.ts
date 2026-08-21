import { apiFetch } from '~/core/lib/api-client';
import { type BackendRole, type BackendUser } from '~/features/auth/data/sources/remote/auth.remote-source';

/** `GET /users` meng-include nama prodi, tidak seperti bentuk `/auth/*`. */
export type BackendUserWithProdi = BackendUser & {
	programStudi: { nama: string } | null;
};

export type CreateUserPayload = {
	namaLengkap: string;
	email: string;
	password: string;
	role: BackendRole;
	programStudiId?: string;
};

/** Semua field opsional — server yang memutuskan mana yang boleh diisi per role. */
export type UpdateUserPayload = {
	namaLengkap?: string;
	email?: string;
	password?: string;
	role?: BackendRole;
	programStudiId?: string;
};

export const userRemoteSource = {
	findAll(): Promise<BackendUserWithProdi[]> {
		return apiFetch<BackendUserWithProdi[]>('/users');
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
