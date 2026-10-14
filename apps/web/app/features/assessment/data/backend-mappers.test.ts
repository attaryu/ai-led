import { describe, expect, it } from 'vitest';

import { mapJudgeVerdict, mapResult } from './backend-mappers';

describe('mapJudgeVerdict', () => {
	it('memetakan verdict apps/ai ke bentuk entity', () => {
		expect(
			mapJudgeVerdict({
				grounded: false,
				hallucinated_claims: ['100 dosen tidak ada di bukti'],
				missing_facts: ['rapat pimpinan'],
				notes: 'Angka mengada-ada.',
				judge_model: 'gpt-oss:20b',
				judged_at: '2026-10-13T10:00:00+00:00',
			}),
		).toEqual({
			grounded: false,
			klaimTakTerdukung: ['100 dosen tidak ada di bukti'],
			faktaTerlewat: ['rapat pimpinan'],
			catatan: 'Angka mengada-ada.',
			model: 'gpt-oss:20b',
			dinilaiPada: '2026-10-13T10:00:00+00:00',
		});
	});

	it.each([[null], [undefined], [{}], [{ error: 'judge unreachable' }], [{ grounded: 'ya' }]])(
		'mengembalikan null untuk %j (belum dijudge atau bentuk rusak)',
		(raw) => {
			expect(mapJudgeVerdict(raw as never)).toBeNull();
		},
	);

	it('menoleransi field opsional yang hilang atau bertipe salah', () => {
		expect(
			mapJudgeVerdict({ grounded: true, hallucinated_claims: 'bukan array', missing_facts: [1, 'a'], notes: 5 }),
		).toEqual({
			grounded: true,
			klaimTakTerdukung: [],
			faktaTerlewat: ['a'],
			catatan: '',
			model: null,
			dinilaiPada: null,
		});
	});
});

describe('mapResult dengan judge', () => {
	const baris = (judgeVerdict: unknown) =>
		({
			id: 'r1',
			sessionId: 's1',
			indicatorNo: 7,
			subNo: '',
			score: '3.00',
			justification: 'j',
			confidence: '0.900',
			recommendation: null,
			error: null,
			createdAt: '2026-10-13T10:00:00Z',
			judgeVerdict,
		}) as never;

	it('mengisi judge dan tidak menyentuh confidence', () => {
		const hasil = mapResult(baris({ grounded: false, notes: 'x' }));
		expect(hasil.judge?.grounded).toBe(false);
		expect(hasil.confidence).toBe(0.9);
	});

	it('judge null bila belum pernah dijudge', () => {
		expect(mapResult(baris(null)).judge).toBeNull();
	});
});
