import { describe, expect, it } from 'vitest';

import {
	kegagalanUnggahBaru,
	kunciKegagalan,
	pilahStatus,
	PESAN_MAKS,
	ringkasPesan,
	tambahKegagalan,
	type KegagalanProses,
} from './evidence-failure';

const gagal = (jenis: 'unggah' | 'ekstraksi', id: string, pesan = 'x'): KegagalanProses => ({
	kunci: kunciKegagalan(jenis, id), jenis, id, nama: `${id}.pdf`, pesan,
});

describe('ringkasPesan', () => {
	it('merapikan spasi/baris baru dan memotong pesan panjang', () => {
		expect(ringkasPesan('MinerU gagal:\n  CUDA   out of memory')).toBe('MinerU gagal: CUDA out of memory');
		const panjang = ringkasPesan('a'.repeat(1000));
		expect(panjang.length).toBe(PESAN_MAKS);
		expect(panjang.endsWith('…')).toBe(true);
	});

	it('memberi pesan bawaan bila penyebab kosong', () => {
		expect(ringkasPesan(null)).toBe('Penyebab tidak dicatat.');
		expect(ringkasPesan('   ')).toBe('Penyebab tidak dicatat.');
	});
});

describe('tambahKegagalan', () => {
	it('tidak menggandakan kegagalan yang sama dan memperbarui pesannya', () => {
		const a = tambahKegagalan([], [gagal('unggah', '1', 'lama')]);
		const b = tambahKegagalan(a, [gagal('unggah', '1', 'baru'), gagal('ekstraksi', '1')]);
		expect(b.map((x) => x.kunci)).toEqual(['unggah:1', 'ekstraksi:1']);
		expect(b[0].pesan).toBe('baru');
	});

	it('jenis yang berbeda dengan id sama adalah dua kegagalan berbeda', () => {
		expect(tambahKegagalan([gagal('unggah', '7')], [gagal('ekstraksi', '7')])).toHaveLength(2);
	});
});

describe('kegagalanUnggahBaru', () => {
	const baris = (id: string, phase: string, error?: string) => ({ id, fileName: `${id}.pdf`, phase, error });

	it('hanya mengumumkan baris yang gagal, sekali saja', () => {
		const dua = [baris('a', 'gagal', 'jaringan putus'), baris('b', 'uploading'), baris('c', 'selesai')];
		const pertama = kegagalanUnggahBaru(dua, new Set());
		expect(pertama.baru.map((x) => x.id)).toEqual(['a']);
		expect(pertama.baru[0]).toMatchObject({ jenis: 'unggah', nama: 'a.pdf', pesan: 'jaringan putus' });

		const kedua = kegagalanUnggahBaru(dua, pertama.diumumkan);
		expect(kedua.baru).toEqual([]);            // tidak ditanyakan lagi selama masih gagal
	});

	it('menanyakan lagi bila berkas yang sama gagal lagi setelah diulang', () => {
		const gagalPertama = kegagalanUnggahBaru([baris('a', 'gagal')], new Set());
		// diulang: baris keluar dari 'gagal' -> dilupakan
		const diulang = kegagalanUnggahBaru([baris('a', 'presign')], gagalPertama.diumumkan);
		expect(diulang.diumumkan.has('a')).toBe(false);
		// gagal lagi -> diumumkan lagi
		const gagalKedua = kegagalanUnggahBaru([baris('a', 'gagal')], diulang.diumumkan);
		expect(gagalKedua.baru.map((x) => x.id)).toEqual(['a']);
	});

	it('mengumumkan semua kegagalan unggah massal sekaligus', () => {
		const banyak = Array.from({ length: 5 }, (_, i) => baris(String(i), 'gagal'));
		expect(kegagalanUnggahBaru(banyak, new Set()).baru).toHaveLength(5);
	});
});

describe('pilahStatus', () => {
	const t = (status: 'MENUNGGU' | 'DIPROSES' | 'SIAP' | 'GAGAL', catatan: string | null = null) => ({
		status, namaDokumen: 'Renstra.pdf', catatanGagal: catatan,
	});

	it('memilah gagal / selesai / menunggu / hilang', () => {
		const terbaru = new Map([
			['e1', t('GAGAL', 'A string literal cannot contain NUL (0x00) characters.')],
			['e2', t('SIAP')],
			['e3', t('MENUNGGU')],
			['e4', t('DIPROSES')],
		]);
		const h = pilahStatus(['e1', 'e2', 'e3', 'e4', 'e5'], terbaru);
		expect(h.gagal).toHaveLength(1);
		expect(h.gagal[0]).toMatchObject({ jenis: 'ekstraksi', id: 'e1', nama: 'Renstra.pdf' });
		expect(h.gagal[0].pesan).toContain('NUL');
		expect(h.selesai).toEqual(['e2']);
		expect(h.menunggu).toEqual(['e3', 'e4']);
		expect(h.hilang).toEqual(['e5']);              // dihapus pengguna -> berhenti dilacak
	});
});
