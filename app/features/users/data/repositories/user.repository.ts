import { type UserEntity } from '../../domain/entities/user.entity';
import { userLocalSource } from '../sources/local/user-local.source';

const initialUsers: UserEntity[] = [
	{
		id: '1',
		namaLengkap: 'Ahmad Fauzi',
		email: 'ahmad.fauzi@univ.ac.id',
		role: 'Penjamin Mutu',
		studyProgramId: null,
		studyProgramName: null,
		createdAt: '2026-07-29T10:00:00.000Z',
	},
	{
		id: '2',
		namaLengkap: 'Siti Rahmawati',
		email: 'siti.rahma@univ.ac.id',
		role: 'Penyusun',
		studyProgramId: '1',
		studyProgramName: 'Teknik Informatika',
		createdAt: '2026-07-29T10:10:00.000Z',
	},
	{
		id: '3',
		namaLengkap: 'Prof. Dr. Ir. H. Bambang',
		email: 'bambang.rektor@univ.ac.id',
		role: 'Pimpinan',
		studyProgramId: null,
		studyProgramName: null,
		createdAt: '2026-07-29T10:20:00.000Z',
	},
	{
		id: '4',
		namaLengkap: 'Dewi Lestari',
		email: 'dewi.admin@univ.ac.id',
		role: 'Admin',
		studyProgramId: null,
		studyProgramName: null,
		createdAt: '2026-07-29T10:30:00.000Z',
	},
	{
		id: '5',
		namaLengkap: 'Budi Santoso',
		email: 'budi.santoso@univ.ac.id',
		role: 'Penyusun',
		studyProgramId: '1',
		studyProgramName: 'Teknik Informatika',
		createdAt: '2026-07-29T10:40:00.000Z',
	},
	{
		id: '6',
		namaLengkap: 'Nurul Hidayah',
		email: 'nurul.hidayah@univ.ac.id',
		role: 'Penyusun',
		studyProgramId: '2',
		studyProgramName: 'Sistem Informasi',
		createdAt: '2026-07-29T10:50:00.000Z',
	},
];

export const userRepository = {
	findAll(): UserEntity[] {
		const stored = userLocalSource.getAll();
		if (!stored) {
			this.save(initialUsers);
			return initialUsers;
		}
		try {
			return JSON.parse(stored);
		} catch (e) {
			this.save(initialUsers);
			return initialUsers;
		}
	},

	save(users: UserEntity[]): void {
		userLocalSource.setAll(JSON.stringify(users));
	},

	/**
	 * Event yang sama dengan fitur lain supaya daftar yang terpasang ikut segar.
	 *
	 * Sengaja terpisah dari `save`: `findAll` ikut memanggil `save` saat menyemai
	 * data awal, dan menyiarkan perubahan dari jalur baca berarti pembacaan saat
	 * render bisa memicu `setState` komponen lain di tengah render.
	 */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	delete(id: string): void {
		const users = this.findAll();
		const updated = users.filter((u) => u.id !== id);
		this.save(updated);
		this.notify();
	},

	findById(id: string): UserEntity | undefined {
		return this.findAll().find((u) => u.id === id);
	},

	/**
	 * Penyusun yang ditugaskan ke satu prodi (`USER.program_studi_id`).
	 *
	 * Penyaringan role ikut di sini, bukan di halaman: role lain memang tidak
	 * pernah punya `studyProgramId` terisi (docs/database.md §2), jadi
	 * "anggota prodi" dan "Penyusun prodi" adalah pertanyaan yang sama.
	 */
	findPenyusunByStudyProgramId(studyProgramId: string): UserEntity[] {
		return this.findAll().filter(
			(u) => u.role === 'Penyusun' && u.studyProgramId === studyProgramId,
		);
	},

	update(id: string, data: Partial<UserEntity>): void {
		const users = this.findAll();
		const updated = users.map((u) => (u.id === id ? { ...u, ...data } : u));
		this.save(updated);
		this.notify();
	},
};
