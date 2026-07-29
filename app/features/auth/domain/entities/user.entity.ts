import { z } from 'zod';

export const userSchema = z.object({
	id: z.string(),
	fullname: z
		.string('Nama lengkap tidak valid')
		.min(1, 'Nama lengkap wajib diisi')
		.max(100, 'Nama lengkap maksimal 100 karakter'),
	email: z
		.email('Email tidak valid')
		.min(1, 'Email wajib diisi')
		.max(100, 'Email maksimal 100 karakter'),
	universityName: z
		.string('Nama universitas tidak valid')
		.min(1, 'Nama universitas wajib diisi')
		.max(100, 'Nama universitas maksimal 100 karakter'),
	password: z
		.string('Password tidak valid')
		.min(6, 'Password minimal 6 karakter'),
});

export type UserEntity = z.infer<typeof userSchema>;
