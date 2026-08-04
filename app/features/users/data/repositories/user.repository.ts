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
		window.dispatchEvent(new Event('storage-update'));
	},

	delete(id: string): void {
		const users = this.findAll();
		const updated = users.filter((u) => u.id !== id);
		this.save(updated);
	},

	findById(id: string): UserEntity | undefined {
		return this.findAll().find((u) => u.id === id);
	},

	update(id: string, data: Partial<UserEntity>): void {
		const users = this.findAll();
		const updated = users.map((u) => (u.id === id ? { ...u, ...data } : u));
		this.save(updated);
	},
};
