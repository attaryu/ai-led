import { useMutation, useQueryClient } from '@tanstack/react-query';

import { endSession, SESSION_QUERY_KEY } from '~/core/lib/query-client';
import { sessionRepository } from '../../data/repositories/session.repository';
import { type SessionEntity } from '../../domain/entities/session.entity';
import {
	type LoginPayload,
	type RegisterPayload,
} from '../../data/sources/remote/auth.remote-source';

/**
 * Ketiga hook di bawah menaruh hasilnya langsung ke cache lewat `setQueryData`,
 * bukan `invalidateQueries`. Responsnya sudah berisi sesi yang lengkap, jadi
 * menandainya basi hanya akan memicu satu `POST /auth/refresh` tambahan —
 * merotasi token yang baru saja diterbitkan, dan menahan pengalihan halaman
 * selama request itu berjalan.
 */

export function useLogin() {
	const queryClient = useQueryClient();

	return useMutation<SessionEntity, Error, LoginPayload>({
		mutationFn: sessionRepository.login,
		onSuccess: (session) => {
			queryClient.setQueryData(SESSION_QUERY_KEY, session);
		},
	});
}

export function useRegister() {
	const queryClient = useQueryClient();

	return useMutation<SessionEntity, Error, RegisterPayload>({
		mutationFn: sessionRepository.register,
		onSuccess: (session) => {
			queryClient.setQueryData(SESSION_QUERY_KEY, session);
		},
	});
}

export function useLogout() {
	return useMutation<void, Error, void>({
		mutationFn: sessionRepository.logout,

		/*
		 * `onSettled`, bukan `onSuccess`: `sessionRepository.logout` sudah membuang
		 * access token di `finally`-nya, jadi begitu pengguna menekan "Keluar" ia
		 * memang keluar — apa pun jawaban server. Cache yang tertinggal setelah
		 * token hilang hanya akan menampilkan data basi yang tak bisa disegarkan.
		 *
		 * Jalur pembersihannya sama persis dengan yang dipakai saat sesi mati
		 * sendiri di tengah pemakaian (`setAuthFailureHandler`) — lihat
		 * `endSession()` untuk alasan urutannya, yang tidak boleh dibalik.
		 */
		onSettled: endSession,
	});
}
