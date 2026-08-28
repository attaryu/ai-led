import { type SessionEntity } from '~/features/auth/domain/entities/session.entity';
import { useSession } from '~/features/auth/presentation/hooks/use-session';

/**
 * Hak akses set akreditasi, mengikuti bentuk
 * {@link ../../../chapter/presentation/hooks/use-chapter-permission useChapterPermission}.
 *
 * - `Admin` tidak punya akses sama sekali. Mengunggah acuan penilaian terasa
 *   administratif, tapi memberi Admin akses di sini akan menjadikannya
 *   satu-satunya tempat Admin menyentuh konten akreditasi — di bukti dukung,
 *   dokumen LED, dan editor bab ia konsisten dijauhkan (§4.4).
 * - `Pimpinan` boleh melihat acuan yang berlaku, tapi tidak mengelolanya —
 *   sejalan dengan ia yang tidak pernah mengubah konten dokumen.
 * - `Penjamin Mutu` satu-satunya pengelola. Secara sistem ia pemegang otoritas
 *   tertinggi atas dokumen (hanya ia yang boleh menghapusnya); secara nyata,
 *   unit penjaminan mutu memang yang memperoleh dan mendistribusikan rubrik
 *   dari lembaga penilai.
 * - `Penyusun` tidak pernah masuk lapis tenant, jadi tidak muncul di sini. Ia
 *   melihat acuan yang dipakai dokumennya dari ruang kerja proyek.
 */
export type AccreditationSetPermission = {
	session: SessionEntity | null;
	/** Boleh membuka daftar set dan melihat isinya. */
	canView: boolean;
	/**
	 * Boleh menambah set, menyunting identitasnya, mengunggah dan menghapus
	 * berkas, serta menghapus set. Satu boolean untuk semuanya karena syaratnya
	 * memang sama persis — hanya `Penjamin Mutu` — dan memecahnya jadi beberapa
	 * nama hanya membuka peluang keduanya menyimpang.
	 */
	canManage: boolean;
};

export function useAccreditationSetPermission(): AccreditationSetPermission {
	// `undefined` (sesi belum selesai dipulihkan) disamakan dengan belum masuk:
	// menampilkan tombol lebih dulu lalu menariknya kembali lebih membingungkan
	// daripada memunculkannya sedikit terlambat.
	const session = useSession() ?? null;

	return {
		session,
		canView: session?.role === 'Pimpinan' || session?.role === 'Penjamin Mutu',
		canManage: session?.role === 'Penjamin Mutu',
	};
}
