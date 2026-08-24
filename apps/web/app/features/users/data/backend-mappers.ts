import { type BackendRole, type BackendUser } from '~/features/auth/data/sources/remote/auth.remote-source';
import { type UserEntity, type UserRole } from '../domain/entities/user.entity';

const ROLE_FROM_BACKEND: Record<BackendRole, UserRole> = {
	ADMIN: 'Admin',
	PIMPINAN: 'Pimpinan',
	PENJAMIN_MUTU: 'Penjamin Mutu',
	PENYUSUN: 'Penyusun',
};

export const ROLE_TO_BACKEND: Record<UserRole, BackendRole> = {
	Admin: 'ADMIN',
	Pimpinan: 'PIMPINAN',
	'Penjamin Mutu': 'PENJAMIN_MUTU',
	Penyusun: 'PENYUSUN',
};

/**
 * `studyProgram` cuma ada di respons `GET /users` (lihat `BackendUserWithProdi`).
 * `create`/`update` mengembalikan `BackendUser` polos — `studyProgramName`-nya
 * jatuh ke `null`, aman karena kedua pemanggil itu langsung pindah halaman
 * sesudahnya (list yang dilihat pengguna datang dari `findAll` yang fresh).
 */
export function toUserEntity(
	row: BackendUser & { studyProgram?: { name: string } | null },
): UserEntity {
	return {
		id: row.id,
		namaLengkap: row.fullName,
		email: row.email,
		role: ROLE_FROM_BACKEND[row.role],
		studyProgramId: row.studyProgramId,
		studyProgramName: row.studyProgram?.name ?? null,
		createdAt: row.createdAt,
	};
}
