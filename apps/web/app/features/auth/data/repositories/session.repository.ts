import { setAccessToken } from '~/core/lib/api-client';
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

export const SESSION_UPDATE_EVENT = 'session-update';

const ROLE_FROM_BACKEND: Record<BackendRole, UserRole> = {
	ADMIN: 'Admin',
	PIMPINAN: 'Pimpinan',
	PENJAMIN_MUTU: 'Penjamin Mutu',
	PENYUSUN: 'Penyusun',
};

function toSession(result: AuthResult): SessionEntity {
	return sessionSchema.parse({
		userId: result.user.id,
		tenantId: result.user.tenantId,
		namaLengkap: result.user.namaLengkap,
		role: ROLE_FROM_BACKEND[result.user.role],
		studyProgramId: result.user.programStudiId,
	});
}

let currentSession: SessionEntity | null = null;
/** Menggabungkan `bootstrap()` yang dipicu bersamaan oleh beberapa `useSession()` jadi satu request. */
let bootstrapInFlight: Promise<SessionEntity | null> | null = null;

export const sessionRepository = {
	/** Sesi yang sudah dibangun di memori — `null` sebelum `bootstrap()`/`login()`/`register()` selesai. */
	get(): SessionEntity | null {
		return currentSession;
	},

	isAuthenticated(): boolean {
		return currentSession !== null;
	},

	async login(payload: LoginPayload): Promise<SessionEntity> {
		const result = await authRemoteSource.login(payload);
		setAccessToken(result.accessToken);
		currentSession = toSession(result);
		window.dispatchEvent(new Event(SESSION_UPDATE_EVENT));
		return currentSession;
	},

	async register(payload: RegisterPayload): Promise<SessionEntity> {
		const result = await authRemoteSource.register(payload);
		setAccessToken(result.accessToken);
		currentSession = toSession(result);
		window.dispatchEvent(new Event(SESSION_UPDATE_EVENT));
		return currentSession;
	},

	/**
	 * Memulihkan sesi dari refresh-token cookie saat aplikasi baru dimuat —
	 * access token hidup di memori saja, jadi hilang tiap reload halaman.
	 * Gagal (tidak ada cookie / kedaluwarsa) berarti memang belum login, bukan
	 * error yang perlu dilaporkan.
	 */
	bootstrap(): Promise<SessionEntity | null> {
		if (bootstrapInFlight) return bootstrapInFlight;

		bootstrapInFlight = (async () => {
			try {
				const result = await authRemoteSource.refresh();
				setAccessToken(result.accessToken);
				currentSession = toSession(result);
			} catch {
				setAccessToken(null);
				currentSession = null;
			}
			window.dispatchEvent(new Event(SESSION_UPDATE_EVENT));
			return currentSession;
		})();

		return bootstrapInFlight;
	},

	async clear(): Promise<void> {
		try {
			await authRemoteSource.logout();
		} finally {
			setAccessToken(null);
			currentSession = null;
			window.dispatchEvent(new Event(SESSION_UPDATE_EVENT));
		}
	},
};
