import type z from 'zod';
import { userSchema } from '../entities/user.entity';

export const registerSchema = userSchema.pick({
	fullname: true,
	email: true,
	universityName: true,
	password: true,
});

export type RegisterDto = z.infer<typeof registerSchema>;