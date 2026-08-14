/**
 * Pembacaan `exp` dari access token, semata untuk menjadwalkan kapan sesi
 * di-refresh sebelum tokennya mati (`use-session.ts`).
 *
 * Payload dibaca **tanpa memverifikasi tanda tangan** — dan itu memang aman di
 * sini, karena hasilnya tidak pernah dipakai untuk keputusan otorisasi apa pun.
 * Yang menentukan boleh-tidaknya sebuah request tetap backend, lewat
 * `JwtAuthGuard`. Token palsu dengan `exp` karangan paling banter membuat
 * frontend menjadwalkan refresh di waktu yang salah, lalu ditolak backend.
 *
 * Peran ini seharusnya tidak perlu ada: kalau `/auth/login|register|refresh`
 * ikut mengembalikan `expiresIn`, berkas ini bisa dihapus. Dicatat di
 * docs/.backend-blockers.md.
 */

/** Payload JWT dikodekan base64url, yang `atob` sendiri tidak mengerti. */
function decodeBase64Url(segment: string): string {
	const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
	return atob(padded);
}

/**
 * Kapan access token kedaluwarsa, dalam milidetik epoch — `null` bila tokennya
 * tidak ada, bentuknya bukan JWT, atau tidak memuat `exp` yang masuk akal.
 *
 * Tidak pernah melempar: pemanggilnya menjadwalkan pekerjaan latar, dan token
 * cacat tidak boleh menjatuhkan render. `null` berarti "tidak bisa dijadwalkan",
 * dan sistem jatuh ke refresh reaktif di `api-client.ts` yang tetap benar.
 */
export function accessTokenExpiry(token: string | null): number | null {
	if (!token) return null;

	const segments = token.split('.');
	if (segments.length !== 3) return null;

	try {
		const payload: unknown = JSON.parse(decodeBase64Url(segments[1]));
		if (!payload || typeof payload !== 'object') return null;

		const { exp } = payload as { exp?: unknown };
		// `exp` JWT bersatuan detik (RFC 7519 §4.1.4), bukan milidetik.
		return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
	} catch {
		return null;
	}
}
