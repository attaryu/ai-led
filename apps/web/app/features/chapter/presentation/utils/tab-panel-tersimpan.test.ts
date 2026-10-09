import { describe, expect, it } from 'vitest';

import { bacaTabTersimpan, simpanTab } from './tab-panel-tersimpan';

const TAB = ['panduan', 'generasi', 'draft'] as const;

function penyimpananPalsu(awal: Record<string, string> = {}) {
	const data = { ...awal };
	return {
		data,
		getItem: (k: string) => data[k] ?? null,
		setItem: (k: string, v: string) => {
			data[k] = v;
		},
	};
}

describe('tab panel tersimpan', () => {
	it('memulihkan tab yang terakhir disimpan', () => {
		const p = penyimpananPalsu();
		simpanTab('draft', p);
		expect(bacaTabTersimpan(TAB, p)).toBe('draft');
	});

	it('kosong atau tab yang sudah tidak ada/disembunyikan -> null (pemanggil jatuh ke bawaan)', () => {
		expect(bacaTabTersimpan(TAB, penyimpananPalsu())).toBeNull();
		const p = penyimpananPalsu();
		simpanTab('chat', p); // tab yang disembunyikan
		expect(bacaTabTersimpan(TAB, p)).toBeNull();
	});

	it('penyimpanan yang melempar tidak merusak apa pun', () => {
		const rusak = {
			getItem: () => {
				throw new Error('diblokir');
			},
			setItem: () => {
				throw new Error('diblokir');
			},
		};
		expect(bacaTabTersimpan(TAB, rusak)).toBeNull();
		expect(() => simpanTab('draft', rusak)).not.toThrow();
		expect(bacaTabTersimpan(TAB, null)).toBeNull();
	});
});
