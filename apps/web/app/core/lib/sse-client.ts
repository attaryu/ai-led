import { API_BASE_URL, getAccessToken } from './api-client';

/**
 * Pembaca `text/event-stream` berbasis `fetch`, bukan `EventSource` bawaan
 * peramban — `EventSource` tidak bisa mengirim header `Authorization` maupun
 * body POST, dan backend kita butuh keduanya (lihat catatan yang sama di
 * `bab-dokumen.controller.ts`'s `chat()` dan `jobs.gateway.ts`).
 *
 * Menghasilkan tiap event `data: {...}` sebagai objek sudah di-`JSON.parse`.
 * Berhenti sendiri saat stream-nya ditutup server, atau saat `signal` dibatalkan.
 */
export async function* streamSse<T = unknown>(
	path: string,
	opts: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): AsyncGenerator<T> {
	const token = getAccessToken();
	const headers: Record<string, string> = { Accept: 'text/event-stream' };
	if (token) headers['Authorization'] = `Bearer ${token}`;
	if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

	const res = await fetch(`${API_BASE_URL}${path}`, {
		method: opts.method ?? 'GET',
		headers,
		credentials: 'include',
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
		signal: opts.signal,
	});

	if (!res.ok || !res.body) {
		throw new Error(`Gagal membuka stream (${res.status})`);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	// Frame SSE dipisah baris kosong ganda (`\n\n`); potongan yang belum genap
	// satu frame disimpan di sini sampai potongan berikutnya melengkapinya.
	let buffer = '';

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return;

			buffer += decoder.decode(value, { stream: true });
			const frames = buffer.split('\n\n');
			// Potongan terakhir belum tentu frame utuh — disimpan untuk putaran berikutnya.
			buffer = frames.pop() ?? '';

			for (const frame of frames) {
				const line = frame
					.split('\n')
					.find((candidate) => candidate.startsWith('data:'));
				if (!line) continue;

				const payload = line.slice('data:'.length).trim();
				if (!payload) continue;
				yield JSON.parse(payload) as T;
			}
		}
	} finally {
		reader.releaseLock();
	}
}
