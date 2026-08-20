/**
 * Client HTTP terpusat ke NestJS backend. Menggantikan repository mock yang
 * sebelumnya menulis langsung ke `localStorage` — lihat catatan migrasi di
 * masing-masing `data/repositories/*.repository.ts`.
 *
 * Access token disimpan di memori saja (bukan `localStorage`), supaya tidak
 * bisa dicuri lewat XSS. Refresh token httpOnly-cookie yang menjaga sesi tetap
 * hidup lintas reload; query `['session']` di `use-session.ts` yang memanggil
 * `/auth/refresh` saat aplikasi dimuat untuk memulihkannya, dan menjadwalkan
 * pemanggilan berikutnya sebelum access token mati.
 *
 * Berkas ini sengaja tidak mengimpor query client maupun router: keduanya
 * hidup di lapisan atas, dan arah impor yang terbalik akan membentuk lingkaran.
 * Kabar bahwa sesi mati disampaikan lewat `setAuthFailureHandler`.
 */

export const API_BASE_URL: string =
	(import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

let accessToken: string | null = null;
/** Epoch ms saat accessToken kedaluwarsa — dari `expiresIn` respons `/auth/*`. */
let accessTokenExpiresAt: number | null = null;

export function getAccessToken(): string | null {
	return accessToken;
}

/** `null` bila tidak ada token atau responsnya tidak menyertakan `expiresIn`. */
export function getAccessTokenExpiry(): number | null {
	return accessTokenExpiresAt;
}

/** `expiresIn` dalam detik, sesuai bentuk respons `/auth/login|register|refresh`. */
export function setAccessToken(token: string | null, expiresIn?: number): void {
	accessToken = token;
	accessTokenExpiresAt = token && expiresIn ? Date.now() + expiresIn * 1000 : null;
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

/**
 * Dipanggil **hanya** ketika `/auth/refresh` sendiri menolak dengan 401/403 —
 * satu-satunya bukti bahwa sesinya memang sudah mati.
 *
 * Backend yang tumbang (5xx) maupun jaringan yang putus sengaja tidak
 * memicunya: keduanya tidak mengatakan apa pun tentang keabsahan sesi, dan
 * mengeluarkan pengguna karena WiFi-nya berkedip adalah kerusakan yang jauh
 * lebih terasa daripada satu request yang gagal.
 */
let onAuthFailure: (() => void) | null = null;

export function setAuthFailureHandler(handler: (() => void) | null): void {
	onAuthFailure = handler;
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
 * Satu percobaan refresh yang sedang berjalan, dibagi ke semua pemanggil.
 *
 * Tanpa ini, satu halaman yang menembak lima request sekaligus dengan access
 * token yang sudah lewat akan menghasilkan lima `POST /auth/refresh` paralel.
 * Backend merotasi token tiap kali dipanggil, jadi kelimanya saling menimpa
 * cookie dan yang menang belum tentu yang tokennya kita simpan.
 */
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Menukar refresh-token cookie dengan access token baru.
 *
 * `true` bila berhasil. `false` bila gagal — dan cara gagalnya menentukan siapa
 * yang diberi tahu:
 *
 * | Sebab                        | Sesi dihapus? | Alasan                                    |
 * | ---------------------------- | ------------- | ----------------------------------------- |
 * | 401 / 403 dari `/auth/refresh` | ya          | cookie hilang atau kedaluwarsa — sesi mati |
 * | 5xx                          | tidak         | backend yang bermasalah, bukan sesinya    |
 * | fetch melempar (offline)     | tidak         | jaringan, bukan sesinya                   |
 */
async function refreshAccessToken(): Promise<boolean> {
	if (refreshInFlight) return refreshInFlight;

	refreshInFlight = (async () => {
		try {
			const res = await rawFetch('/auth/refresh', {
				method: 'POST',
				skipAuthRetry: true,
			});

			if (res.ok) {
				const { accessToken: token, expiresIn } = (await res.json()) as {
					accessToken: string;
					expiresIn: number;
				};
				setAccessToken(token, expiresIn);
				return true;
			}

			if (res.status === 401 || res.status === 403) {
				setAccessToken(null);
				onAuthFailure?.();
			}

			// 5xx dan sisanya: token lama dibiarkan apa adanya. Ia memang sudah
			// tidak terpakai, tapi membuangnya tidak menolong siapa pun dan
			// menghapus satu-satunya petunjuk `exp` untuk penjadwalan ulang.
			return false;
		} catch {
			// Jaringan putus — jangan sentuh sesi.
			return false;
		} finally {
			// Dilepas supaya 401 berikutnya bisa memicu percobaan baru; tanpa ini
			// satu kegagalan sementara akan mengunci refresh selamanya.
			refreshInFlight = null;
		}
	})();

	return refreshInFlight;
}

/**
 * Satu-satunya jalan memanggil backend. 401 (kecuali dari `/auth/refresh`
 * sendiri) memicu satu kali percobaan refresh diam-diam lalu mengulang
 * permintaan aslinya — itulah "interceptor"-nya.
 *
 * Ini jalur reaktif, jaring pengaman untuk keadaan yang lolos dari penjadwalan
 * proaktif di `use-session.ts`: tab yang lama di latar belakang, jam yang
 * meleset, atau token yang dicabut backend lebih cepat dari `exp`-nya.
 */
export async function apiFetch<T = unknown>(
	path: string,
	opts: ApiFetchOptions = {},
): Promise<T> {
	let res = await rawFetch(path, opts);

	if (res.status === 401 && !opts.skipAuthRetry) {
		if (await refreshAccessToken()) {
			res = await rawFetch(path, opts);
		}
	}

	if (!res.ok) {
		throw new ApiError(res.status, await parseErrorMessage(res));
	}

	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}
