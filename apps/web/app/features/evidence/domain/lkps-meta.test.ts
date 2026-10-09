import { describe, expect, it } from 'vitest';

import { labelLkps, LKPS_NAMA_MAX, LKPS_PERIODE_MAX, sarankanNamaLkps, validateLkpsMeta } from './lkps-meta';

describe('validateLkpsMeta', () => {
	it('menerima nama dan periode yang terisi', () => {
		expect(validateLkpsMeta({ nama: 'LKPS TS 2024', periode: '2023/2024' })).toEqual({});
	});

	it('menolak nama dan periode kosong atau hanya spasi, per kolom', () => {
		expect(validateLkpsMeta({ nama: '', periode: '2024' })).toEqual({ nama: 'Nama LKPS wajib diisi' });
		expect(validateLkpsMeta({ nama: '   ', periode: '2024' }).nama).toBeDefined();
		expect(validateLkpsMeta({ nama: 'LKPS', periode: '  ' })).toEqual({ periode: 'Tahun/periode wajib diisi' });
		expect(Object.keys(validateLkpsMeta({ nama: '', periode: '' }))).toEqual(['nama', 'periode']);
	});

	it('menegakkan batas panjang yang sama dengan backend (255 dan 40)', () => {
		expect(validateLkpsMeta({ nama: 'x'.repeat(LKPS_NAMA_MAX), periode: '2024' })).toEqual({});
		expect(validateLkpsMeta({ nama: 'x'.repeat(LKPS_NAMA_MAX + 1), periode: '2024' }).nama).toContain('255');
		expect(validateLkpsMeta({ nama: 'LKPS', periode: 'x'.repeat(LKPS_PERIODE_MAX + 1) }).periode).toContain('40');
	});
});

describe('sarankanNamaLkps', () => {
	it('membuang ekstensi Excel dan mengganti garis bawah dengan spasi', () => {
		expect(sarankanNamaLkps('LKPS_TI_2024.xlsx')).toBe('LKPS TI 2024');
		expect(sarankanNamaLkps('data.XLS')).toBe('data');
		expect(sarankanNamaLkps('catatan.txt')).toBe('catatan.txt');
	});
});

describe('labelLkps', () => {
	it('menampilkan periode bila ada, dan hanya nama untuk LKPS lama', () => {
		expect(labelLkps({ namaDokumen: 'LKPS TS 2024', periode: '2023/2024' })).toBe('LKPS TS 2024 (2023/2024)');
		expect(labelLkps({ namaDokumen: 'lkps-lama.xlsx', periode: null })).toBe('lkps-lama.xlsx');
	});
});
