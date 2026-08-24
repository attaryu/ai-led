import { apiFetch } from '~/core/lib/api-client';

/** Role sebagaimana disimpan backend (Prisma enum) — lihat packages/db/prisma/schema.prisma. */
export type BackendRole = 'ADMIN' | 'PIMPINAN' | 'PENJAMIN_MUTU' | 'PENYUSUN';

/** Bentuk respons `user` dari `/auth/*` — Prisma `User` minus `passwordHash`. */
export type BackendUser = {
	id: string;
	tenantId: string;
	studyProgramId: string | null;
	fullName: string;
	email: string;
	role: BackendRole;
	createdAt: string;
};

export type AuthResult = {
	accessToken: string;
	/** Detik sampai accessToken kedaluwarsa. */
	expiresIn: number;
	user: BackendUser;
};

export type RegisterPayload = {
	universityName: string;
	fullName: string;
	email: string;
	password: string;
};

export type LoginPayload = {
	email: string;
	password: string;
};

export const authRemoteSource = {
	register(payload: RegisterPayload): Promise<AuthResult> {
		return apiFetch<AuthResult>('/auth/register', { method: 'POST', body: payload });
	},

	login(payload: LoginPayload): Promise<AuthResult> {
		return apiFetch<AuthResult>('/auth/login', { method: 'POST', body: payload });
	},

	/** `skipAuthRetry` mencegah loop tak berujung — ini fungsi yang dipanggil api-client saat 401. */
	refresh(): Promise<AuthResult> {
		return apiFetch<AuthResult>('/auth/refresh', { method: 'POST', skipAuthRetry: true });
	},

	logout(): Promise<{ success: boolean }> {
		return apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' });
	},
};
