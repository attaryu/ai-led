import type z from 'zod';
import { userSchema } from '../entities/user.entity';

export const loginSchema = userSchema.pick({
	email: true,
	password: true,
});

export type LoginDto = z.infer<typeof loginSchema>;
