import { afterEach, expect, it, vi } from 'vitest';

import { sessionRepository } from '~/features/auth/data/repositories/session.repository';

import { apiFetch, refreshSession, setAccessToken } from './api-client';

afterEach(() => {
	vi.unstubAllGlobals();
	setAccessToken(null);
});

it('restore + a concurrent 401 retry share ONE /auth/refresh (issue #13)', async () => {
	let refreshCalls = 0;
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		if (url.endsWith('/auth/refresh')) {
			refreshCalls += 1;
			await new Promise((r) => setTimeout(r, 10));
			return new Response(JSON.stringify({
				accessToken: 't',
				expiresIn: 900,
				user: { id: 'u1', tenantId: 't1', studyProgramId: 'p1', fullName: 'Budi', email: 'b@x.id', role: 'PENYUSUN', createdAt: '' },
			}), { status: 200 });
		}
		// Data request: 401 until the token is restored.
		const auth = init?.headers as Record<string, string> | undefined;
		return auth?.Authorization
			? new Response(JSON.stringify({ ok: true }), { status: 200 })
			: new Response('{}', { status: 401 });
	});
	vi.stubGlobal('fetch', fetchMock);

	const [session, data] = await Promise.all([
		sessionRepository.restore(),
		apiFetch<{ ok: boolean }>('/program-studi/p1'),
	]);

	expect(refreshCalls).toBe(1);
	expect(session?.role).toBe('Penyusun');
	expect(data).toEqual({ ok: true });
});

it('401 from /auth/refresh is "dead"; 5xx is "unavailable" (session kept)', async () => {
	vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
	expect((await refreshSession()).status).toBe('dead');

	vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
	expect((await refreshSession()).status).toBe('unavailable');
});
