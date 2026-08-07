import * as React from 'react';

import {
	SESSION_UPDATE_EVENT,
	sessionRepository,
} from '../../data/repositories/session.repository';

/**
 * Apakah ada sesi tersimpan — pertanyaan yang berbeda dari "siapa yang sedang
 * masuk", yang `useSession` selalu punya jawabannya.
 *
 * Hanya landing page publik yang membutuhkannya: halaman di dalam aplikasi
 * sudah berada di balik asumsi bahwa pengguna sudah masuk.
 */
export function useIsAuthenticated(): boolean {
	const [authenticated, setAuthenticated] = React.useState(() =>
		typeof window === 'undefined' ? false : sessionRepository.isAuthenticated(),
	);

	React.useEffect(() => {
		const sync = () => setAuthenticated(sessionRepository.isAuthenticated());
		sync();
		window.addEventListener(SESSION_UPDATE_EVENT, sync);
		return () => window.removeEventListener(SESSION_UPDATE_EVENT, sync);
	}, []);

	return authenticated;
}
