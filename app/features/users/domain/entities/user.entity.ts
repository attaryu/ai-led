import { z } from 'zod';

export const userRoleEnum = z.enum(['Penjamin Mutu', 'Penyusun', 'Pimpinan']);
export type UserRole = z.infer<typeof userRoleEnum>;

export const userSchema = z.object({
	id: z.string(),
	namaLengkap: z
		.string()
		.min(3, 'Nama lengkap minimal 3 karakter')
		.max(50, 'Nama lengkap maksimal 50 karakter'),
	email: z
		.email('Email tidak valid')
		.min(1, 'Email wajib diisi')
		.max(100, 'Email maksimal 100 karakter'),
	role: userRoleEnum,
	studyProgramId: z.string().optional().nullable(),
	studyProgramName: z.string().optional().nullable(),
	createdAt: z.string(),
});

export type UserEntity = z.infer<typeof userSchema>;
