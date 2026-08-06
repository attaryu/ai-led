import z from 'zod';
import { userSchema } from '../entities/user.entity';

export const loginSchema = userSchema
	.pick({
		email: true,
	})
	.extend({
		password: z
			.string('Password tidak valid')
			.min(6, 'Password minimal 6 karakter'),
	});

export type LoginDto = z.infer<typeof loginSchema>;
