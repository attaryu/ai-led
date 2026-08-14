import { QueryClient } from '@tanstack/react-query';

import { ApiError, setAuthFailureHandler } from './api-client';

/**
 * Kunci query sesi, dipakai bersama oleh `use-session.ts`, hook mutation auth,
 * dan handler kegagalan di bawah. Dikumpulkan di sini supaya ketiganya tidak
 * bisa menulis literal yang berbeda satu huruf.
 */
export const SESSION_QUERY_KEY = ['session'] as const;

/**
 * Satu client untuk seluruh aplikasi. Aman dibuat di tingkat modul karena
 * `react-router.config.ts` menyetel `ssr: false` — tidak ada render server yang
 * cache-nya bisa bocor antar-request, dan tidak ada hidrasi yang perlu dijaga.
 */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			/**
			 * Error HTTP tidak diulang sama sekali.
			 *
			 * `apiFetch` sudah punya alur refresh-lalu-ulangi sendiri, jadi 401 yang
			 * sampai ke sini artinya refresh-nya pun sudah gagal — mengulanginya tiga
			 * kali lagi hanya melipatgandakan request tanpa mengubah hasil. Begitu
			 * pula 403 dan 404: keduanya jawaban final, bukan kegagalan sementara.
			 *
			 * Yang layak diulang justru kegagalan jaringan, karena `fetch` melempar
			 * alih-alih mengembalikan `Response` — dan itu memang sering sementara.
			 */
			retry: (failureCount, error) =>
				!(error instanceof ApiError) && failureCount < 2,
			staleTime: 30_000,
		},
		mutations: {
			retry: false,
		},
	},
});

/**
 * Mengakhiri sesi di sisi klien: menandai pengguna sebagai tamu, lalu membuang
 * seluruh data milik tenant yang barusan ditinggalkan.
 *
 * **Urutannya penting, dan `clear()` tidak boleh dipakai di sini.**
 * `queryClient.clear()` mencabut *semua* query dari cache termasuk `['session']`
 * sendiri. Observer yang sedang terpasang tetap menggenggam objek query yang
 * sudah dicabut itu dan berhenti menerima pembaruan, sehingga `setQueryData`
 * sesudahnya menulis ke query baru yang tidak ditonton siapa pun — komponen
 * tidak pernah re-render dan pengguna tetap terlihat masuk meski sesinya sudah
 * mati. Maka: isi `['session']` dengan `null` lebih dulu supaya observer-nya
 * yang masih hidup melihatnya, baru buang sisanya.
 *
 * Sisa cache tetap harus dibuang: setiap query lain berisi daftar user, prodi,
 * atau dokumen milik organisasi sebelumnya, dan menyisakannya berarti sesi
 * berikutnya bisa melihatnya sekejap sebelum refetch pertamanya selesai.
 * Komponen yang menonton query-query itu justru sedang dilepas saat ini juga,
 * karena guard-nya barusan memutuskan mengalihkan halaman.
 *
 * Sengaja tidak ada `navigate` di sini. Begitu `['session']` jadi `null`, setiap
 * `useRoleGuard` yang sedang terpasang menyimpulkannya sendiri dan mengantar ke
 * `/login?next=…` — deklaratif, dan tidak menuntut akses router dari luar React.
 */
export function endSession(): void {
	queryClient.setQueryData(SESSION_QUERY_KEY, null);
	queryClient.removeQueries({
		predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0],
	});
}

setAuthFailureHandler(endSession);
