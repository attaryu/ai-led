import { describe, expect, it } from 'vitest';

import {
	bangunSemuaTabelSetor,
	bangunTabelSetor,
	jumlahDipilih,
	kodeTabelSetor,
	paragrafDariTeks,
	susunPayload,
	type IndikatorSection,
} from './indicator-assessment.entity';

const IND: IndikatorSection[] = [
	{ id: 'a', kode: '1', deskripsi: 'Indikator satu' },
	{ id: 'b', kode: '2', deskripsi: 'Indikator dua' },
	{ id: 'c', kode: '3', deskripsi: 'Indikator tiga' },
];

describe('susunPayload', () => {
	it('tidak ada yang dicentang → ikuList kosong, jumlah 0', () => {
		expect(jumlahDipilih({})).toBe(0);
		expect(susunPayload(IND, {})).toEqual({ ok: true, ikuList: [] });
	});

	it('hanya indikator dicentang yang masuk; target string dari skor', () => {
		const r = susunPayload(IND, {
			a: { dipilih: true, skor: 3 },
			b: { dipilih: true, skor: 2 },
			c: { dipilih: false, skor: 4 },
		});
		expect(r).toEqual({
			ok: true,
			ikuList: [
				{ kode: '1', indikator: 'Indikator satu', target: '3' },
				{ kode: '2', indikator: 'Indikator dua', target: '2' },
			],
		});
	});

	it('skor 0 valid dan dikirim sebagai "0"', () => {
		const r = susunPayload(IND, { a: { dipilih: true, skor: 0 } });
		expect(r).toEqual({ ok: true, ikuList: [{ kode: '1', indikator: 'Indikator satu', target: '0' }] });
	});

	it('dicentang tanpa skor → ditolak, menyebut id-nya', () => {
		expect(susunPayload(IND, { a: { dipilih: true, skor: null }, b: { dipilih: true, skor: 1 } })).toEqual({
			ok: false,
			indikatorTanpaSkor: ['a'],
		});
	});

	it('skor lama pada indikator yang dinonaktifkan tidak ikut dan tidak memblokir', () => {
		expect(susunPayload(IND, { a: { dipilih: false, skor: null }, b: { dipilih: false, skor: 3 } })).toEqual({
			ok: true,
			ikuList: [],
		});
	});
});

describe('paragrafDariTeks', () => {
	it('memecah string berpenomoran satu baris tanpa mengubah kata', () => {
		const p = paragrafDariTeks('1) Tingkatkan mutu 2) Perkuat bimbingan 3) Evaluasi');
		expect(p.map((n) => n.content?.[0]?.text)).toEqual(['1) Tingkatkan mutu', '2) Perkuat bimbingan', '3) Evaluasi']);
	});

	it('mempertahankan baris baru; teks kosong → satu paragraf kosong', () => {
		expect(paragrafDariTeks('a\nb')).toHaveLength(2);
		expect(paragrafDariTeks('  ')).toEqual([{ type: 'paragraph' }]);
	});
});

const iku = { kode: '1', indikator: 'Indikator satu', target: '3' };
const sukses = {
	kode: '1',
	capaian: { nilai: 'RIPK = 3,46', sumber: 'LKPS Tabel 6.b' },
	evaluasi: 'MELAMPAUI' as const,
	analisisKetercapaian: 'analisis',
	usulanTargetTahunDepan: 'usulan',
	strategiPencapaian: '1) a 2) b',
	sarprasDibutuhkan: '1) x',
};

const barisLebar = (t: ReturnType<typeof bangunTabelSetor>) => t.content!.slice(2);

describe('bangunTabelSetor', () => {
	it('lima kolom header, baris data, lalu empat bagian analisis berlebar 5 kolom', () => {
		const t = bangunTabelSetor(iku, sukses);
		expect(t.type).toBe('table');
		expect(t.content![0].content!.map((c) => c.content![0].content![0].text)).toEqual(['No', 'Indikator', 'Target', 'Capaian', 'Evaluasi']);
		const data = t.content![1].content!.map((c) => c.content!.map((p) => p.content?.[0]?.text).join('|'));
		expect(data).toEqual(['1', 'Indikator satu', '3', 'RIPK = 3,46|Sumber: LKPS Tabel 6.b', 'Melampaui standar']);
		const sisa = barisLebar(t);
		expect(sisa).toHaveLength(8);
		for (const b of sisa) expect(b.content![0].attrs).toMatchObject({ colspan: 5 });
		expect(sisa.filter((_, i) => i % 2 === 0).map((b) => b.content![0].content![0].content![0].text)).toEqual([
			'Analisis Ketercapaian',
			'Strategi Pencapaian',
			'Sarpras Dibutuhkan',
			'Usulan Target Tahun Depan',
		]);
		expect(sisa[0].content![0].content![0].content![0].marks).toEqual([{ type: 'bold' }]);
	});

	it('MELAMPAUI/MEMENUHI tidak memunculkan bagian tambahan walau ada', () => {
		const t = bangunTabelSetor(iku, { ...sukses, tambahan: { faktorPendukung: 'x' } });
		expect(barisLebar(t)).toHaveLength(8);
	});

	it('BELUM_MEMENUHI + tambahan → empat bagian tambahan dari respons', () => {
		const t = bangunTabelSetor(iku, {
			...sukses,
			evaluasi: 'BELUM_MEMENUHI',
			tambahan: { faktorPendukung: 'p', faktorPenghambat: 'h', akarMasalah: 'm', tindakLanjut: 't' },
		});
		const judul = barisLebar(t).filter((_, i) => i % 2 === 0).map((b) => b.content![0].content![0].content![0].text);
		expect(judul.slice(4)).toEqual(['Faktor Pendukung', 'Faktor Penghambat', 'Akar Masalah', 'Tindak Lanjut']);
		expect(t.content![1].content![4].content![0].content![0].text).toBe('Belum memenuhi standar');
	});

	it('BELUM_MEMENUHI tanpa objek tambahan → tidak mengarang bagian tambahan', () => {
		const t = bangunTabelSetor(iku, { ...sukses, evaluasi: 'BELUM_MEMENUHI' });
		expect(barisLebar(t)).toHaveLength(8);
	});

	it('IKU error: tabel tetap ada, capaian berisi keterangan, evaluasi dan analisis kosong', () => {
		const t = bangunTabelSetor(iku, { kode: '1', error: 'Capaian tidak ditemukan di LKPS/LED/bukti dukung' });
		const data = t.content![1].content!;
		expect(data[3].content![0].content![0].text).toBe('Capaian tidak ditemukan di LKPS/LED/bukti dukung');
		expect(data[4].content![0]).toEqual({ type: 'paragraph' });
		expect(barisLebar(t)).toHaveLength(8);
		expect(barisLebar(t)[1].content![0].content![0]).toEqual({ type: 'paragraph' });
	});

	it('hasil hilang (job dibatalkan) diperlakukan sebagai capaian tidak ditemukan', () => {
		const t = bangunTabelSetor(iku, undefined);
		expect(t.content![1].content![3].content![0].content![0].text).toBe('Capaian tidak ditemukan');
	});
});

describe('bangunSemuaTabelSetor & kodeTabelSetor', () => {
	it('satu tabel per IKU, dipasangkan lewat kode, bukan posisi', () => {
		const list = [iku, { kode: '2', indikator: 'Dua', target: '1' }];
		const tabel = bangunSemuaTabelSetor(list, [{ ...sukses, kode: '2' }, { kode: '1', error: 'x' }]);
		expect(tabel).toHaveLength(2);
		expect(kodeTabelSetor(tabel[0])).toBe('1');
		expect(tabel[0].content![1].content![3].content![0].content![0].text).toBe('x');
		expect(tabel[1].content![1].content![4].content![0].content![0].text).toBe('Melampaui standar');
	});

	it('kodeTabelSetor tidak mengenali tabel biasa', () => {
		expect(kodeTabelSetor({ type: 'table', content: [{ type: 'tableRow', content: [] }] })).toBeNull();
	});
});
