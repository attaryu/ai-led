import z from 'zod';
import { userSchema } from '../entities/user.entity';

export const registerSchema = userSchema
	.pick({
		fullname: true,
		email: true,
		universityName: true,
	})
	.extend({
		password: z
			.string('Password tidak valid')
			.min(6, 'Password minimal 6 karakter'),
	});

export type RegisterDto = z.infer<typeof registerSchema>;
