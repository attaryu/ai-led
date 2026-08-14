import * as React from 'react';

import {
	SESSION_UPDATE_EVENT,
	sessionRepository,
} from '../../data/repositories/session.repository';
import { type SessionEntity } from '../../domain/entities/session.entity';

/**
 * Session user yang sedang aktif.
 *
 * Tiga keadaan: `undefined` (belum diketahui — `bootstrap()` lewat
 * `/auth/refresh` masih berjalan), `null` (dipastikan belum login), atau
 * sesi sungguhan. `useRoleGuard` memetakan `undefined` ke status `'pending'`
 * supaya halaman tidak sempat mengira pengguna adalah tamu padahal sesinya
 * baru saja belum selesai dipulihkan dari refresh-token cookie.
 */
export function useSession(): SessionEntity | null | undefined {
	const [session, setSession] = React.useState<SessionEntity | null | undefined>(
		undefined,
	);

	React.useEffect(() => {
		const sync = () => setSession(sessionRepository.get());
		window.addEventListener(SESSION_UPDATE_EVENT, sync);

		if (sessionRepository.isAuthenticated()) {
			sync();
		} else {
			void sessionRepository.bootstrap().then(sync);
		}

		return () => window.removeEventListener(SESSION_UPDATE_EVENT, sync);
	}, []);

	return session;
}
