import { describe, expect, it, vi } from 'vitest';

import {
	jumlahkanProgres,
	kunciSasaranJudge,
	pollJudge,
	ringkasJudge,
	sesiIdUnik,
	type JudgeStatusSnapshot,
} from './assessment-judge-poll';

const snap = (over: Partial<JudgeStatusSnapshot> = {}): JudgeStatusSnapshot => ({
	status: 'running',
	total: 4,
	done: 1,
	skipped: 0,
	failed: 0,
	error: null,
	...over,
});

const alat = (urutan: (JudgeStatusSnapshot | null)[], masihBerlaku = () => true) => {
	const cek = vi.fn();
	for (const s of urutan) cek.mockResolvedValueOnce(s);
	return {
		cek,
		masihBerlaku: vi.fn(masihBerlaku),
		tidur: vi.fn().mockResolvedValue(undefined),
		jedaMs: 2000,
		onProgres: vi.fn(),
	};
};

describe('pollJudge', () => {
	it('berhenti saat completed dan melaporkan progres tiap putaran', async () => {
		const a = alat([snap(), snap({ done: 3 }), snap({ status: 'completed', done: 4 })]);

		const hasil = await pollJudge(a);

		expect(hasil).toEqual({ kind: 'selesai', progres: { total: 4, done: 4, skipped: 0, failed: 0 } });
		expect(a.onProgres).toHaveBeenCalledTimes(3);
		expect(a.tidur).toHaveBeenCalledTimes(2);
		expect(a.tidur).toHaveBeenCalledWith(2000);
	});

	it('melaporkan gagal beserta pesannya', async () => {
		const a = alat([snap({ status: 'failed', error: 'model juri mati' })]);
		expect(await pollJudge(a)).toEqual({ kind: 'gagal', pesan: 'model juri mati' });
	});

	it('memberi pesan bawaan bila gagal tanpa keterangan', async () => {
		const a = alat([snap({ status: 'failed', error: null })]);
		const hasil = await pollJudge(a);
		expect(hasil.kind).toBe('gagal');
	});

	it('apps/ai restart (cek -> null/404): berhenti sebagai "hilang" dengan progres terakhir, bukan galat', async () => {
		const a = alat([snap({ done: 2 }), null]);

		const hasil = await pollJudge(a);

		expect(hasil).toEqual({ kind: 'hilang', progres: { total: 4, done: 2, skipped: 0, failed: 0 } });
	});

	it('berhenti diam-diam bila sesi sudah berganti', async () => {
		let berlaku = true;
		const a = alat([snap(), snap()], () => berlaku);
		a.tidur.mockImplementation(async () => {
			berlaku = false;
		});

		expect(await pollJudge(a)).toEqual({ kind: 'dibatalkan' });
		expect(a.cek).toHaveBeenCalledTimes(1);
	});
});

describe('ringkasJudge', () => {
	it('merangkum dijudge, dilewati, dan gagal', () => {
		expect(ringkasJudge({ total: 60, done: 60, skipped: 6, failed: 2 })).toBe(
			'58 dijudge, 6 dilewati (bukti tidak tersimpan atau belum dinilai), 2 gagal',
		);
	});

	it('menyebut hanya yang relevan', () => {
		expect(ringkasJudge({ total: 3, done: 3, skipped: 0, failed: 0 })).toBe('3 dijudge');
	});

	it('menjelaskan bila tidak ada yang bisa dijudge', () => {
		expect(ringkasJudge({ total: 0, done: 0, skipped: 5, failed: 0 })).toBe(
			'0 dijudge, 5 dilewati (bukti tidak tersimpan atau belum dinilai)',
		);
	});
});

describe('jumlahkanProgres', () => {
	it('menjumlahkan keempat bidang', () => {
		expect(
			jumlahkanProgres(
				{ total: 4, done: 3, skipped: 1, failed: 1 },
				{ total: 6, done: 6, skipped: 2, failed: 0 },
			),
		).toEqual({ total: 10, done: 9, skipped: 3, failed: 1 });
	});

	it('nol adalah unsur netral', () => {
		const p = { total: 5, done: 5, skipped: 1, failed: 2 };
		expect(jumlahkanProgres(p, { total: 0, done: 0, skipped: 0, failed: 0 })).toEqual(p);
	});
});

describe('sesiIdUnik', () => {
	it('unik dengan urutan pertama-muncul', () => {
		expect(sesiIdUnik([{ sesiId: 'B' }, { sesiId: 'A' }, { sesiId: 'B' }, { sesiId: 'A' }])).toEqual(['B', 'A']);
	});

	it('tampilan gabungan "terbaru": indikator 1-2 di sesi A, 3-6 di sesi B -> kedua sesi dijudge', () => {
		const hasil = [1, 2].map(() => ({ sesiId: 'A' })).concat([3, 4, 5, 6].map(() => ({ sesiId: 'B' })));
		expect(sesiIdUnik(hasil)).toEqual(['A', 'B']);
	});

	it('kosong -> kosong', () => {
		expect(sesiIdUnik([])).toEqual([]);
	});
});

describe('kunciSasaranJudge', () => {
	it('stabil dan membedakan sesi, nomor, dan sub', () => {
		expect(kunciSasaranJudge('s1', 7, '')).toBe('s1|7|');
		expect(kunciSasaranJudge('s1', 7, '')).toBe(kunciSasaranJudge('s1', 7, ''));
		expect(kunciSasaranJudge('s1', 43, 'I')).not.toBe(kunciSasaranJudge('s1', 43, 'II'));
		expect(kunciSasaranJudge('s1', 7, '')).not.toBe(kunciSasaranJudge('s2', 7, ''));
	});
});
