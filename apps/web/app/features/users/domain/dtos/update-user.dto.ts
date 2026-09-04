import { z } from 'zod';
import { userSchema } from '../entities/user.entity';

export const updateUserSchema = userSchema
	.pick({
		namaLengkap: true,
		email: true,
		role: true,
		studyProgramId: true,
	})
	.extend({
		showPasswordChange: z.boolean(),
		password: z.string().optional(),
	})
	.refine(
		(data) => {
			if (data.showPasswordChange && (!data.password || data.password.length < 6)) {
				return false;
			}
			return true;
		},
		{
			message: 'Password minimal 6 karakter jika ingin diubah',
			path: ['password'],
		}
	)
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
		}
	);

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
