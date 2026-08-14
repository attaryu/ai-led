import { useSession } from './use-session';

/**
 * Apakah ada sesi tersimpan — pertanyaan yang berbeda dari "siapa yang sedang
 * masuk", yang `useSession` selalu punya jawabannya begitu boot selesai.
 *
 * Hanya landing page publik yang membutuhkannya: halaman di dalam aplikasi
 * sudah berada di balik asumsi bahwa pengguna sudah masuk. Selama boot
 * (`session === undefined`) dianggap belum masuk — landing page memang lebih
 * aman menawarkan "Masuk" sebentar daripada salah menampilkan menu terautentikasi.
 */
export function useIsAuthenticated(): boolean {
	const session = useSession();
	return session != null;
}
