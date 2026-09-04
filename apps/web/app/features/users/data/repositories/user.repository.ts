import { toUserEntity, ROLE_TO_BACKEND } from '../backend-mappers';
import { type UserEntity, type UserRole } from '../../domain/entities/user.entity';
import { userRemoteSource } from '../sources/remote/user.remote-source';

export const userRepository = {
	/** Event yang sama dengan fitur lain supaya daftar yang terpasang ikut segar. */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	async findAll(): Promise<UserEntity[]> {
		const rows = await userRemoteSource.findAll();
		return rows.map(toUserEntity);
	},

	async findById(id: string): Promise<UserEntity | undefined> {
		return (await this.findAll()).find((u) => u.id === id);
	},

	/**
	 * Penyusun yang ditugaskan ke satu prodi (`USER.program_studi_id`).
	 *
	 * Penyaringan role ikut di sini, bukan di halaman: role lain memang tidak
	 * pernah punya `studyProgramId` terisi (docs/database.md §2), jadi
	 * "anggota prodi" dan "Penyusun prodi" adalah pertanyaan yang sama.
	 */
	async findPenyusunByStudyProgramId(studyProgramId: string): Promise<UserEntity[]> {
		return (await this.findAll()).filter(
			(u) => u.role === 'Penyusun' && u.studyProgramId === studyProgramId,
		);
	},

	/** Admin-only di backend — lihat `UsersService.create`. */
	async create(input: {
		namaLengkap: string;
		email: string;
		password: string;
		role: UserRole;
		studyProgramId: string | null;
	}): Promise<UserEntity> {
		const row = await userRemoteSource.create({
			fullName: input.namaLengkap,
			email: input.email,
			password: input.password,
			role: ROLE_TO_BACKEND[input.role],
			studyProgramId: input.studyProgramId ?? undefined,
		});
		this.notify();
		return toUserEntity(row);
	},

	/**
	 * Admin boleh mengisi field manapun (edit profil penuh); Pimpinan hanya
	 * boleh mengisi `studyProgramId` (§4.2) — field lain ditolak backend dengan
	 * 403. Lihat `UsersService.update`.
	 */
	async update(
		id: string,
		data: {
			namaLengkap?: string;
			email?: string;
			password?: string;
			role?: UserRole;
			studyProgramId?: string | null;
		},
	): Promise<UserEntity> {
		const row = await userRemoteSource.update(id, {
			fullName: data.namaLengkap,
			email: data.email,
			password: data.password,
			role: data.role ? ROLE_TO_BACKEND[data.role] : undefined,
			studyProgramId: data.studyProgramId ?? undefined,
		});
		this.notify();
		return toUserEntity(row);
	},

	/** Admin-only di backend. Menolak (409) kalau user masih punya data terkait. */
	async delete(id: string): Promise<void> {
		await userRemoteSource.remove(id);
		this.notify();
	},
};
