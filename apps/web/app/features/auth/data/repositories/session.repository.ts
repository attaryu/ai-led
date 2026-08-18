import { ApiError, setAccessToken } from '~/core/lib/api-client';
import { type UserRole } from '~/features/users/domain/entities/user.entity';
import {
	sessionSchema,
	type SessionEntity,
} from '../../domain/entities/session.entity';
import {
	authRemoteSource,
	type AuthResult,
	type BackendRole,
	type LoginPayload,
	type RegisterPayload,
} from '../sources/remote/auth.remote-source';

const ROLE_FROM_BACKEND: Record<BackendRole, UserRole> = {
	ADMIN: 'Admin',
	PIMPINAN: 'Pimpinan',
	PENJAMIN_MUTU: 'Penjamin Mutu',
	PENYUSUN: 'Penyusun',
};

function toSession(result: AuthResult): SessionEntity {
	setAccessToken(result.accessToken, result.expiresIn);
	return sessionSchema.parse({
		userId: result.user.id,
		tenantId: result.user.tenantId,
		namaLengkap: result.user.namaLengkap,
		role: ROLE_FROM_BACKEND[result.user.role],
		studyProgramId: result.user.programStudiId,
	});
}

/**
 * Repository tanpa state.
 *
 * Sebelumnya berkas ini memegang `currentSession`, menggabungkan bootstrap yang
 * bertabrakan lewat `bootstrapInFlight`, dan menyiarkan perubahan lewat
 * `window` CustomEvent. Ketiganya dihapus: cache, penggabungan request yang
 * sedang berjalan, dan penyiaran ke seluruh subscriber adalah tepat apa yang
 * TanStack Query kerjakan — lihat query `['session']` di `use-session.ts`.
 *
 * Yang tersisa cuma pemetaan bentuk backend ke `SessionEntity`, plus satu efek
 * samping yang memang tidak punya rumah lain: menaruh access token ke memori
 * `api-client`.
 */
export const sessionRepository = {
	async login(payload: LoginPayload): Promise<SessionEntity> {
		return toSession(await authRemoteSource.login(payload));
	},

	async register(payload: RegisterPayload): Promise<SessionEntity> {
		return toSession(await authRemoteSource.register(payload));
	},

	/**
	 * Memulihkan sesi dari refresh-token cookie — access token hidup di memori
	 * saja, jadi hilang tiap kali halaman dimuat ulang. Fungsi yang sama juga
	 * dipakai untuk memperpanjang sesi sebelum access token mati, karena
	 * "memulihkan sesi" dan "memperbarui token" memang satu tindakan.
	 *
	 * `null` berarti **dipastikan belum login**, dan hanya 401/403 yang berhak
	 * menyimpulkan itu. Sisanya dilempar ulang: backend yang tumbang atau
	 * jaringan yang putus tidak mengatakan apa pun tentang keabsahan sesi, dan
	 * memperlakukannya sebagai "belum login" akan menendang pengguna ke halaman
	 * masuk padahal sesinya baik-baik saja. Dengan dilempar, Query mengulang
	 * sendiri dan tetap memegang sesi yang terakhir berhasil.
	 */
	async restore(): Promise<SessionEntity | null> {
		try {
			return toSession(await authRemoteSource.refresh());
		} catch (e) {
			if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
				setAccessToken(null);
				return null;
			}
			throw e;
		}
	},

	/**
	 * `finally` supaya token tetap dibuang meski backend tidak bisa dihubungi:
	 * pengguna menekan "Keluar" dan harus benar-benar keluar, apa pun jawaban
	 * server. Backend sendiri sudah mencabut refresh token cookie-nya di sisi
	 * server (denylist Redis) begitu `/auth/logout` diterima — lihat
	 * `AuthController.logout`.
	 */
	async logout(): Promise<void> {
		try {
			await authRemoteSource.logout();
		} finally {
			setAccessToken(null);
		}
	},
};
