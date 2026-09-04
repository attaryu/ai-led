import { useQuery } from '@tanstack/react-query';

import { getAccessTokenExpiry } from '~/core/lib/api-client';
import { SESSION_QUERY_KEY } from '~/core/lib/query-client';
import { sessionRepository } from '../../data/repositories/session.repository';
import { type SessionEntity } from '../../domain/entities/session.entity';

/**
 * Jarak aman sebelum access token mati. Cukup longgar untuk menampung jam
 * klien yang meleset dan satu kali gagal-lalu-ulang, tapi masih jauh di bawah
 * umur token (15 menit) sehingga tidak menghasilkan refresh yang sia-sia.
 */
const REFRESH_MARGIN_MS = 60_000;

/**
 * Batas bawah penjadwalan. Tanpa ini, token yang sudah lewat masanya (mis.
 * laptop baru bangun dari sleep) akan menghasilkan interval nol dan Query
 * berputar sekencang mungkin.
 */
const MIN_REFRESH_DELAY_MS = 5_000;

/**
 * Kapan sesi perlu di-refetch, dihitung dari `expiresIn` yang dikembalikan
 * `/auth/login|register|refresh`. `false` berarti tidak ada jadwal.
 *
 * `null` dari `getAccessTokenExpiry` — tidak ada token — bukan keadaan
 * darurat: jalur reaktif di `api-client` (401 → refresh → ulangi) tetap
 * menambal semuanya, hanya dengan satu request gagal lebih dulu.
 */
function msUntilRefresh(): number | false {
	const expiresAt = getAccessTokenExpiry();
	if (expiresAt === null) return false;
	return Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, MIN_REFRESH_DELAY_MS);
}

/**
 * Session user yang sedang aktif.
 *
 * Tiga keadaan: `undefined` (belum diketahui — pemulihan lewat `/auth/refresh`
 * masih berjalan), `null` (dipastikan belum login), atau sesi sungguhan.
 * `useRoleGuard` memetakan `undefined` ke status `'pending'` supaya halaman
 * tidak sempat mengira pengguna adalah tamu padahal sesinya baru saja belum
 * selesai dipulihkan dari refresh-token cookie.
 *
 * Sesi diperbarui **sebelum** access token mati, bukan sesudah: `queryFn`-nya
 * memang `/auth/refresh`, jadi merefetch query ini dan memperpanjang token
 * adalah tindakan yang sama, dan `refetchInterval` sudah menjadwalkannya. Yang
 * membuat pengguna keluar hanyalah penolakan dari `/auth/refresh` sendiri —
 * backend tumbang atau jaringan putus membiarkan sesi terakhir tetap dipegang
 * (`restore()` melempar, `data` lama bertahan).
 */
export function useSession(): SessionEntity | null | undefined {
	const { data, isPending } = useQuery({
		queryKey: SESSION_QUERY_KEY,
		queryFn: sessionRepository.restore,

		/*
		 * Sesi tidak pernah basi karena umur; yang menentukan kapan ia disegarkan
		 * adalah umur token, dan itu sudah dipegang `refetchInterval` di bawah.
		 */
		staleTime: Infinity,

		refetchInterval: msUntilRefresh,

		/*
		 * Tab di latar belakang sengaja tidak dibiarkan menembak request. Saat
		 * kembali dibuka tokennya mungkin sudah lewat — request pertama kena 401
		 * lalu ditambal jalur reaktif `api-client`. Itu memang jaring pengamannya.
		 */
		refetchIntervalInBackground: false,
	});

	/*
	 * `data` sengaja dibaca tanpa memeriksa `isError`. Query mempertahankan hasil
	 * terakhir yang berhasil meski refetch berikutnya gagal, jadi sesi yang sudah
	 * berdiri tetap utuh saat backend tumbang atau jaringan putus — persis yang
	 * kita mau, dan pengguna tidak ke mana-mana.
	 *
	 * Yang tersisa cuma satu keadaan yang memang tak terpecahkan: gagal pada
	 * pemuatan pertama, ketika belum ada apa pun untuk dipertahankan. Di situ
	 * `data` memang `undefined` dan pengguna diantar ke `/login` — bukan karena
	 * kita menyimpulkan ia belum masuk, tapi karena tidak ada jawaban lain yang
	 * lebih jujur selain menggantungnya di layar pemuatan selamanya.
	 */
	return isPending ? undefined : (data ?? null);
}
