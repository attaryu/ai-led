import * as React from 'react';

const STORAGE_KEY = 'sidebar_collapsed';

/**
 * Keadaan ciut sidebar `AppShell`, bertahan lintas halaman dan muat ulang.
 *
 * **Nilai awalnya selalu melebar, bukan hasil baca penyimpanan.** Cabang ini
 * berjalan di SPA mode React Router (`ssr: false`), tapi kerangkanya tetap
 * di-prerender saat build — komponen ini ikut dijalankan di Node, dan
 * `localStorage` tidak ada di sana. Membacanya di inisialisasi `useState` juga
 * akan membuat markup prerender berbeda dari markup klien. Pola yang sama sudah
 * dipakai `use-panel-resize.ts` dengan alasan yang sama.
 *
 * `siap` ada supaya lebar tidak beranimasi saat pertama kali dibaca: tanpa itu,
 * pengguna yang menyimpan keadaan ciut akan melihat sidebar melebar penuh dulu
 * lalu menyusut sendiri di tiap muat ulang. Pemanggil memakainya untuk menunda
 * pemasangan transisi sampai sesudah pembacaan pertama.
 *
 * Seluruh akses penyimpanan dibungkus `try/catch`: di mode privat dan pada
 * peramban yang memblokir data situs, `localStorage` bukan mengembalikan null
 * melainkan **melempar** — dan sidebar yang gagal dimuat bukan alasan yang sah
 * untuk merobohkan seluruh halaman.
 */
export function useSidebarCollapse() {
	const [ciut, setCiut] = React.useState(false);
	const [siap, setSiap] = React.useState(false);

	React.useEffect(() => {
		try {
			setCiut(window.localStorage.getItem(STORAGE_KEY) === '1');
		} catch {
			// Penyimpanan tidak bisa dibaca; biarkan melebar seperti bawaannya.
		}
		setSiap(true);
	}, []);

	const alihkan = React.useCallback(() => {
		setCiut((sebelumnya) => {
			const berikutnya = !sebelumnya;
			try {
				window.localStorage.setItem(STORAGE_KEY, berikutnya ? '1' : '0');
			} catch {
				// Gagal menyimpan tidak boleh membatalkan perubahan di layar —
				// keadaannya tetap berubah, hanya tidak bertahan sesudah ditutup.
			}
			return berikutnya;
		});
	}, []);

	return { ciut, alihkan, siap };
}
