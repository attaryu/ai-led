import { describe, expect, it } from 'vitest';

import {
	buildSectionTree,
	deriveSectionProgress,
	deriveSectionRowHint,
	isPureContainer,
	type SectionOverviewEntity,
} from './section-overview.entity';

function sec(
	id: string,
	parentId: string | null,
	urutan: number,
	patch: Partial<SectionOverviewEntity> = {},
): SectionOverviewEntity {
	return {
		id,
		parentId,
		urutan,
		judul: id,
		marker: null,
		status: 'PENDING',
		error: null,
		terkunci: false,
		diajukanReviewPada: null,
		catatanPenjaminMutu: null,
		catatanOlehNama: null,
		catatanPada: null,
		...patch,
	};
}

describe('buildSectionTree', () => {
	it('menyusun induk-anak terurut urutan beserta kedalamannya', () => {
		const tree = buildSectionTree([
			sec('b', null, 2),
			sec('a2', 'a', 2),
			sec('a', null, 1),
			sec('a1', 'a', 1),
			sec('a1x', 'a1', 1),
		]);
		expect(tree.map((n) => n.section.id)).toEqual(['a', 'b']);
		expect(tree[0].children.map((n) => n.section.id)).toEqual(['a1', 'a2']);
		expect(tree[0].children[0].children[0]).toMatchObject({ depth: 2 });
		expect(tree[1].depth).toBe(0);
	});

	it('memperlakukan sub-bab yatim sebagai akar', () => {
		const tree = buildSectionTree([sec('a', null, 1), sec('o', 'hilang', 2)]);
		expect(tree.map((n) => n.section.id)).toEqual(['a', 'o']);
	});

	it('tahan siklus dan daftar kosong', () => {
		expect(buildSectionTree([])).toEqual([]);
		expect(buildSectionTree([sec('x', 'x', 1)])).toHaveLength(1);
	});

	it('merender kedalaman berapa pun', () => {
		const tree = buildSectionTree([
			sec('a', null, 1),
			sec('b', 'a', 1),
			sec('c', 'b', 1),
			sec('d', 'c', 1),
		]);
		expect(tree[0].children[0].children[0].children[0].depth).toBe(3);
	});
});

describe('deriveSectionProgress', () => {
	it('memakai empat langkah dari yang paling membatasi', () => {
		const semua = sec('s', null, 1, {
			terkunci: true,
			diajukanReviewPada: '2026-01-01',
			status: 'GENERATED',
		});
		expect(deriveSectionProgress(semua)).toBe('TERKUNCI');
		expect(deriveSectionProgress({ ...semua, terkunci: false })).toBe(
			'MENUNGGU_REVIEW',
		);
		expect(
			deriveSectionProgress(sec('s', null, 1, { status: 'GENERATED' })),
		).toBe('SEDANG_DISUSUN');
		expect(deriveSectionProgress(sec('s', null, 1))).toBe('BELUM_DIISI');
	});

	it('pembangkitan AI bukan progres penulisan', () => {
		expect(
			deriveSectionProgress(sec('s', null, 1, { status: 'GENERATING' })),
		).toBe('BELUM_DIISI');
		expect(
			deriveSectionProgress(sec('s', null, 1, { status: 'ERROR' })),
		).toBe('BELUM_DIISI');
	});
});

describe('deriveSectionRowHint', () => {
	it('menandai sedang dan gagal dibangkitkan', () => {
		expect(
			deriveSectionRowHint(sec('s', null, 1, { status: 'GENERATING' })),
		).toBe('dibangkitkan');
		expect(deriveSectionRowHint(sec('s', null, 1, { status: 'ERROR' }))).toBe(
			'gagal',
		);
		expect(deriveSectionRowHint(sec('s', null, 1))).toBe('normal');
		expect(
			deriveSectionRowHint(sec('s', null, 1, { status: 'GENERATED' })),
		).toBe('normal');
	});

	it('diabaikan bila sudah dikunci atau diajukan', () => {
		expect(
			deriveSectionRowHint(
				sec('s', null, 1, { status: 'ERROR', terkunci: true }),
			),
		).toBe('normal');
		expect(
			deriveSectionRowHint(
				sec('s', null, 1, {
					status: 'GENERATING',
					diajukanReviewPada: '2026-01-01',
				}),
			),
		).toBe('normal');
	});
});

describe('isPureContainer', () => {
	it('wadah murni hanya bila punya anak dan tanpa keadaan sendiri', () => {
		const [akar] = buildSectionTree([sec('a', null, 1), sec('b', 'a', 1)]);
		expect(isPureContainer(akar)).toBe(true);
		expect(isPureContainer(akar.children[0])).toBe(false);

		const [bercatatan] = buildSectionTree([
			sec('a', null, 1, { catatanPenjaminMutu: 'perbaiki' }),
			sec('b', 'a', 1),
		]);
		expect(isPureContainer(bercatatan)).toBe(false);

		const [tergenerate] = buildSectionTree([
			sec('a', null, 1, { status: 'GENERATED' }),
			sec('b', 'a', 1),
		]);
		expect(isPureContainer(tergenerate)).toBe(false);
	});
});
