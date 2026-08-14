/**
 * Client HTTP terpusat ke NestJS backend. Menggantikan repository mock yang
 * sebelumnya menulis langsung ke `localStorage` — lihat catatan migrasi di
 * masing-masing `data/repositories/*.repository.ts`.
 *
 * Access token disimpan di memori saja (bukan `localStorage`), supaya tidak
 * bisa dicuri lewat XSS. Refresh token httpOnly-cookie yang menjaga sesi tetap
 * hidup lintas reload; `bootstrapSession` di `session.repository.ts` yang
 * memanggil `/auth/refresh` sekali saat aplikasi dimuat untuk memulihkannya.
 */

const API_BASE_URL: string =
	(import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

let accessToken: string | null = null;

export function getAccessToken(): string | null {
	return accessToken;
}

export function setAccessToken(token: string | null): void {
	accessToken = token;
}

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

async function parseErrorMessage(res: Response): Promise<string> {
	try {
		const body: unknown = await res.json();
		if (body && typeof body === 'object' && 'message' in body) {
			const { message } = body as { message: unknown };
			if (Array.isArray(message)) return message.join(', ');
			if (typeof message === 'string') return message;
		}
	} catch {
		// Respons bukan JSON (mis. 502 dari proxy) — jatuh ke pesan generik di bawah.
	}
	return `Permintaan gagal (${res.status})`;
}

export type ApiFetchOptions = {
	method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
	body?: unknown;
	/** Lewati percobaan refresh-lalu-ulang otomatis saat 401 (dipakai `/auth/refresh` sendiri). */
	skipAuthRetry?: boolean;
};

async function rawFetch(path: string, opts: ApiFetchOptions): Promise<Response> {
	const headers: Record<string, string> = {};
	if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
	if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

	return fetch(`${API_BASE_URL}${path}`, {
		method: opts.method ?? 'GET',
		headers,
		credentials: 'include',
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	});
}

/**
 * Satu-satunya jalan memanggil backend. 401 (kecuali dari `/auth/refresh`
 * sendiri) memicu satu kali percobaan refresh diam-diam lalu mengulang
 * permintaan aslinya — itulah "interceptor"-nya.
 */
export async function apiFetch<T = unknown>(
	path: string,
	opts: ApiFetchOptions = {},
): Promise<T> {
	let res = await rawFetch(path, opts);

	if (res.status === 401 && !opts.skipAuthRetry) {
		const refreshed = await rawFetch('/auth/refresh', {
			method: 'POST',
			skipAuthRetry: true,
		});
		if (refreshed.ok) {
			const { accessToken: token } = (await refreshed.json()) as {
				accessToken: string;
			};
			setAccessToken(token);
			res = await rawFetch(path, opts);
		} else {
			setAccessToken(null);
		}
	}

	if (!res.ok) {
		throw new ApiError(res.status, await parseErrorMessage(res));
	}

	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}
