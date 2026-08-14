import { z } from 'zod';

import { userRoleEnum } from '~/features/users/domain/entities/user.entity';

/**
 * User yang sedang login.
 *
 * Sengaja memakai `userRoleEnum` yang sudah ada di fitur `users` — bukan
 * membuat daftar role kedua — supaya tidak ada dua sumber kebenaran yang bisa
 * berbeda isinya. `role` backend memakai enum `Role` Prisma (huruf besar,
 * tanpa spasi); pemetaannya ada di `session.repository.ts`.
 *
 * Dibangun dari respons `/auth/login|register|refresh`, bukan disimpan
 * langsung — access token-nya sendiri hidup di memori (`api-client.ts`), jadi
 * sesi ini dibangun ulang tiap boot lewat `bootstrapSession()`.
 */
export const sessionSchema = z.object({
	userId: z.string(),
	tenantId: z.string(),
	namaLengkap: z.string(),
	role: userRoleEnum,
	studyProgramId: z.string().nullable(),
});

export type SessionEntity = z.infer<typeof sessionSchema>;
