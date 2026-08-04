import * as React from 'react';

import {
	SESSION_UPDATE_EVENT,
	sessionRepository,
} from '../../data/repositories/session.repository';
import { type SessionEntity } from '../../domain/entities/session.entity';

/**
 * Session user yang sedang aktif.
 *
 * Nilai awal dibaca langsung saat render pertama (lazy initializer), bukan di
 * dalam useEffect — supaya sidebar tidak sempat menampilkan menu role yang
 * salah selama satu frame. Aman karena aplikasi berjalan SPA (`ssr: false` di
 * react-router.config.ts), jadi tidak ada markup server yang perlu dicocokkan.
 *
 * Tipe `null` tetap dipertahankan sebagai penjaga bila SSR diaktifkan nanti.
 */
export function useSession(): SessionEntity | null {
	const [session, setSession] = React.useState<SessionEntity | null>(() =>
		typeof window === 'undefined' ? null : sessionRepository.get(),
	);

	React.useEffect(() => {
		const sync = () => setSession(sessionRepository.get());
		sync();
		window.addEventListener(SESSION_UPDATE_EVENT, sync);
		return () => window.removeEventListener(SESSION_UPDATE_EVENT, sync);
	}, []);

	return session;
}
