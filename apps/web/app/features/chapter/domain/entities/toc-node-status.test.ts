import { describe, expect, it } from 'vitest';

import { type ChapterEntity } from './chapter.entity';
import { type SectionOverviewEntity } from './section-overview.entity';
import { deriveTocNodeStatus } from './toc-node-status.entity';

function sec(
	id: string,
	parentId: string | null,
	patch: Partial<SectionOverviewEntity> = {},
): SectionOverviewEntity {
	return {
		id,
		parentId,
		urutan: 1,
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

function bab(sections: SectionOverviewEntity[], patch: Partial<ChapterEntity> = {}) {
	return {
		id: 'b1',
		ledProjectId: 'p',
		urutanBab: 1,
		judulBab: 'Bab',
		kontenKerja: null,
		checkpointAktifId: null,
		terkunci: false,
		catatanPenjaminMutu: null,
		catatanOlehNama: null,
		catatanPada: null,
		diajukanReviewPada: null,
		terakhirDisimpan: null,
		buktiDukung: [],
		ragas: null,
		hasilSkorKriteriaAktif: [],
		sections,
		...patch,
	} as ChapterEntity;
}

describe('deriveTocNodeStatus', () => {
	it('simpul bab memakai status turunan bab', () => {
		const chapters = [bab([], { terkunci: true })];
		expect(
			deriveTocNodeStatus({ urutanBab: 1, sectionId: null }, chapters),
		).toMatchObject({ progress: 'TERKUNCI', hint: 'normal' });
		expect(deriveTocNodeStatus({ urutanBab: 2, sectionId: null }, chapters)).toBeNull();
	});

	it('simpul sub-bab memakai status sub-bab dan petunjuk barisnya', () => {
		const chapters = [
			bab([
				sec('a', null, { status: 'GENERATED' }),
				sec('g', null, { status: 'ERROR', error: 'gagal' }),
				sec('m', null, { status: 'GENERATING' }),
			]),
		];
		const s = (id: string) => deriveTocNodeStatus({ urutanBab: null, sectionId: id }, chapters);
		expect(s('a')).toMatchObject({ progress: 'SEDANG_DISUSUN', hint: 'normal' });
		expect(s('g')).toMatchObject({ progress: 'BELUM_DIISI', hint: 'gagal', error: 'gagal' });
		expect(s('m')).toMatchObject({ progress: 'BELUM_DIISI', hint: 'dibangkitkan' });
	});

	it('wadah murni, simpul dekoratif, dan sub-bab tak dikenal tanpa status', () => {
		const chapters = [bab([sec('induk', null), sec('anak', 'induk', { status: 'GENERATED' })])];
		expect(deriveTocNodeStatus({ urutanBab: null, sectionId: 'induk' }, chapters)).toBeNull();
		expect(deriveTocNodeStatus({ urutanBab: null, sectionId: 'anak' }, chapters)).not.toBeNull();
		expect(deriveTocNodeStatus({ urutanBab: null, sectionId: null }, chapters)).toBeNull();
		expect(deriveTocNodeStatus({ urutanBab: null, sectionId: 'x' }, chapters)).toBeNull();
	});
});
