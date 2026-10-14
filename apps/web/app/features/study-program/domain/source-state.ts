/**
 * Status satu sumber data di dashboard: belum selesai dimuat, siap, atau gagal.
 * "Gagal" dibedakan dari "kosong" supaya panel tidak berbohong bahwa datanya
 * tidak ada padahal pembacaannya yang putus.
 */
export type SourceState<T> =
	| { status: 'loading' }
	| { status: 'ready'; data: T }
	| { status: 'error' };

export const SOURCE_LOADING: SourceState<never> = { status: 'loading' };

/** Hasil `Promise.allSettled` satu sumber menjadi status sumbernya. */
export function toSourceState<T>(result: PromiseSettledResult<T>): SourceState<T> {
	return result.status === 'fulfilled'
		? { status: 'ready', data: result.value }
		: { status: 'error' };
}
