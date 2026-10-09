import { describe, expect, it } from 'vitest';

import { gabungPenilaian, kunciIndikator } from './assessment-session.entity';

const kriteria = (no: number, subNo: string) =>
	({ id: `c${no}${subNo}`, no, subNo, kodeKriteria: `${no}.${subNo}`, kriteria: 'G', deskripsi: 'd', tipeSkor: 'kualitatif', tabelLkps: [], levelSkor: [], urutanBab: [] }) as never;

const hasil = (indikatorNo: number, subNo: string, skor: number) =>
	({ id: `h${indikatorNo}${subNo}`, sesiId: 's', indikatorNo, subNo, skor, justifikasi: '', confidence: 0.9, rekomendasi: null, error: null, dinilaiPada: '2026-01-01' }) as never;

describe('gabungPenilaian dengan sub-indikator', () => {
	it('memberi 43.I dan 43.II hasil masing-masing, tidak saling menimpa', () => {
		const baris = gabungPenilaian({
			kriteria: [kriteria(43, 'I'), kriteria(43, 'II')],
			hasil: [hasil(43, 'I', 3), hasil(43, 'II', 1)],
			keputusan: [],
		});
		expect(baris.map((b) => b.skorFinal)).toEqual([3, 1]);
	});

	it('hasil lama (sub kosong) tetap tampil sampai dinilai ulang', () => {
		const baris = gabungPenilaian({
			kriteria: [kriteria(43, 'I'), kriteria(43, 'II')],
			hasil: [hasil(43, '', 2)],
			keputusan: [],
		});
		expect(baris.map((b) => b.skorFinal)).toEqual([2, 2]);
	});

	it('hasil sub-indikator mengalahkan hasil lama bernomor sama', () => {
		const baris = gabungPenilaian({
			kriteria: [kriteria(43, 'I'), kriteria(43, 'II')],
			hasil: [hasil(43, '', 2), hasil(43, 'II', 4)],
			keputusan: [],
		});
		expect(baris.map((b) => b.skorFinal)).toEqual([2, 4]);
	});

	it('kunciIndikator membedakan sub-indikator dan menganggap undefined = kosong', () => {
		expect(kunciIndikator(43, 'I')).not.toBe(kunciIndikator(43, 'II'));
		expect(kunciIndikator(43, undefined)).toBe(kunciIndikator(43, ''));
	});
});
