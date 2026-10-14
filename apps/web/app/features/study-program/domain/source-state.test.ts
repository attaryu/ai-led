import { describe, expect, it } from 'vitest';

import { toSourceState } from './source-state';

describe('toSourceState', () => {
	it('mengubah hasil yang berhasil menjadi ready beserta datanya', () => {
		expect(toSourceState({ status: 'fulfilled', value: [1, 2] })).toEqual({
			status: 'ready',
			data: [1, 2],
		});
	});

	it('mengubah hasil yang ditolak menjadi error tanpa data', () => {
		expect(toSourceState({ status: 'rejected', reason: new Error('403') })).toEqual({
			status: 'error',
		});
	});

	it('menganggap larik kosong sebagai ready, bukan error', () => {
		expect(toSourceState({ status: 'fulfilled', value: [] }).status).toBe('ready');
	});
});
