import { type UserRole } from '~/features/users/domain/entities/user.entity';
import {
	sessionSchema,
	type SessionEntity,
} from '../../domain/entities/session.entity';
import { sessionLocalSource } from '../sources/local/session-local.source';

export const SESSION_UPDATE_EVENT = 'session-update';

/**
 * Identitas contoh per role, diselaraskan dengan mock di
 * `users/data/repositories/user.repository.ts` supaya `userId` yang dipakai
 * pengalih role benar-benar ada di daftar user.
 */
const sessionPerRole: Record<UserRole, SessionEntity> = {
	Pimpinan: {
		userId: '3',
		namaLengkap: 'Prof. Dr. Ir. H. Bambang',
		role: 'Pimpinan',
		studyProgramId: null,
	},
	'Penjamin Mutu': {
		userId: '1',
		namaLengkap: 'Ahmad Fauzi',
		role: 'Penjamin Mutu',
		studyProgramId: null,
	},
	Penyusun: {
		userId: '2',
		namaLengkap: 'Siti Rahmawati',
		role: 'Penyusun',
		// Penyusun selalu terikat ke tepat satu prodi (docs/database.md → USER).
		studyProgramId: '1',
	},
};

/**
 * Default Pimpinan: role dengan menu paling lengkap, sehingga kondisi awal
 * aplikasi tidak terlihat seperti ada menu yang hilang.
 */
const defaultSession = sessionPerRole.Pimpinan;

export const sessionRepository = {
	get(): SessionEntity {
		const stored = sessionLocalSource.get();
		if (!stored) return defaultSession;
		try {
			const parsed = sessionSchema.safeParse(JSON.parse(stored));
			return parsed.success ? parsed.data : defaultSession;
		} catch {
			return defaultSession;
		}
	},

	setRole(role: UserRole): void {
		sessionLocalSource.set(JSON.stringify(sessionPerRole[role]));
		window.dispatchEvent(new Event(SESSION_UPDATE_EVENT));
	},
};
