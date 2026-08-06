import { z } from 'zod';
import { userSchema } from '../entities/user.entity';

export const createUserSchema = userSchema
	.pick({
		namaLengkap: true,
		email: true,
		role: true,
		studyProgramId: true,
	})
	.extend({
		password: z.string().min(6, 'Password minimal 6 karakter'),
	})
	.refine(
		(data) => {
			if (
				data.role === 'Penyusun' &&
				(!data.studyProgramId || data.studyProgramId.trim() === '')
			) {
				return false;
			}
			return true;
		},
		{
			message: 'Prodi wajib dipilih jika role adalah Penyusun',
			path: ['studyProgramId'],
		},
	);

export type CreateUserDto = z.infer<typeof createUserSchema>;
