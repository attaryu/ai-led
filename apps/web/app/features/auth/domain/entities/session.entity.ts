import { z } from 'zod';

import { userRoleEnum } from '~/features/users/domain/entities/user.entity';

/**
 * User yang sedang login.
 *
 * Sengaja memakai `userRoleEnum` yang sudah ada di fitur `users` — bukan
 * membuat daftar role kedua — supaya tidak ada dua sumber kebenaran yang bisa
 * berbeda isinya.
 *
 * Untuk sekarang isinya disimpan di localStorage karena autentikasi belum
 * terhubung ke backend. Bentuk datanya sudah disamakan dengan `USER` di
 * docs/database.md agar penggantian ke API nanti tidak menyentuh presentasi.
 */
export const sessionSchema = z.object({
	userId: z.string(),
	namaLengkap: z.string(),
	role: userRoleEnum,
	studyProgramId: z.string().nullable(),
});

export type SessionEntity = z.infer<typeof sessionSchema>;
