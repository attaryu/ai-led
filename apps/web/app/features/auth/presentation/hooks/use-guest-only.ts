import { useSearchParams } from 'react-router';

import { ApiError } from '~/core/lib/api-client';
import { landingFor } from './use-role-guard';
import { useSession } from './use-session';

/**
 * Pesan yang layak dibaca pengguna dari kegagalan `/auth/*`.
 *
 * `ApiError` selalu membawa pesan dari backend — "Email atau password salah",
 * "Email sudah terdaftar" — dan itu jauh lebih berguna daripada apa pun yang
 * bisa kita karang. Selain itu (jaringan putus, backend tumbang) pesan aslinya
 * justru membingungkan, jadi diganti kalimat yang menyarankan tindakan.
 */
export function authErrorMessage(error: Error | null, fallback: string): string | null {
	if (!error) return null;
	return error instanceof ApiError ? error.message : fallback;
}

/**
 * Tujuan yang diminta sebelum pengguna dialihkan ke `/login`, dititipkan
 * `useRoleGuard` lewat `?next=`.
 *
 * Hanya path relatif yang diterima. `//jahat.example` dan `https://…` ditolak
 * karena keduanya akan diperlakukan browser sebagai alamat luar — celah
 * pengalihan terbuka yang murah sekali dibuat dan murah sekali ditutup.
 */
export function safeNextPath(next: string | null): string | null {
	if (!next) return null;
	if (!next.startsWith('/') || next.startsWith('//')) return null;
	return next;
}

export type GuestOnlyResult =
	| { status: 'allowed' }
	| { status: 'denied'; redirectTo: string }
	/** Sesi belum selesai dipulihkan — belum bisa dinilai tamu atau bukan. */
	| { status: 'pending' };

/**
 * Kebalikan `useRoleGuard`: menjaga halaman yang justru **tidak** boleh dilihat
 * pengguna yang sudah masuk, yaitu `/login` dan `/register`.
 *
 * Bentuk hasilnya sengaja meniru `RoleGuardResult` supaya kedua halaman itu
 * menanganinya dengan pola yang sama persis seperti seluruh layout ruang kerja
 * — satu cabang memuat, satu cabang `<Navigate/>`.
 *
 * Tujuan pengalihannya menghormati `?next=` lebih dulu: pengguna yang mendarat
 * di sini karena mengklik tautan dalam ke `/dashboard/users` harus sampai ke
 * sana, bukan ke halaman pendaratan role-nya.
 */
export function useGuestOnly(): GuestOnlyResult {
	const session = useSession();
	const [searchParams] = useSearchParams();

	if (session === undefined) return { status: 'pending' };
	if (session === null) return { status: 'allowed' };

	return {
		status: 'denied',
		redirectTo: safeNextPath(searchParams.get('next')) ?? landingFor(session),
	};
}
