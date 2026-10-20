import { describe, expect, it } from 'vitest';

import {
	aturCentang,
	bangunDokumenSetor,
	bangunBarisIku,
	bangunTabelSetor,
	formatAngka,
	hitungCapaianPersen,
	jumlahDipilih,
	paragrafDariTeks,
	SKOR_PILIHAN,
	susunPayload,
	tentukanEvaluasi,
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

	it('skor dikirim sebagai string "1"–"4"', () => {
		const r = susunPayload(IND, { a: { dipilih: true, skor: 1 } });
		expect(r).toEqual({ ok: true, ikuList: [{ kode: '1', indikator: 'Indikator satu', target: '1' }] });
	});

	it('pilihan skor hanya 1–4', () => {
		expect(SKOR_PILIHAN).toEqual([1, 2, 3, 4]);
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

const iku = { kode: '1', indikator: 'Indikator satu', target: '4' };
const sukses = {
	kode: '1',
	score: 4,
	analisisKetercapaian: 'analisis',
	usulanTargetTahunDepan: 'usulan',
	strategiPencapaian: '1) a 2) b',
	sarprasDibutuhkan: '1) x',
};

type Baris = ReturnType<typeof bangunBarisIku>[number];
const teksPar = (n: { content?: { text?: string }[] }) => n.content?.[0]?.text ?? '';
const selData = (r: Baris) => r.content!.map((c) => c.content!.map(teksPar).join('|'));
/** Isi satu baris analisis gabungan sebagai daftar paragraf: [teks, tebal?]. */
const isiAnalisis = (r: Baris) =>
	r.content![0].content!.map((p) => [teksPar(p), Boolean(p.content?.[0]?.marks?.length)] as const);

describe('tentukanEvaluasi / hitungCapaianPersen / formatAngka', () => {
	it('score = target → Memenuhi; lebih tinggi → Melampaui; lebih rendah → Belum', () => {
		expect(tentukanEvaluasi(4, 4)).toBe('MEMENUHI');
		expect(tentukanEvaluasi(3.5, 3)).toBe('MELAMPAUI');
		expect(tentukanEvaluasi(3.5, 4)).toBe('BELUM_MEMENUHI');
	});

	it('capaian persen = score/target × 100', () => {
		expect(hitungCapaianPersen(3.5, 4)).toBe(87.5);
		expect(hitungCapaianPersen(4, 2)).toBe(200);
	});

	it('format Indonesia: koma, maks dua digit, tanpa nol di ekor', () => {
		expect(formatAngka(87.5)).toBe('87,5');
		expect(formatAngka(100)).toBe('100');
		expect(formatAngka(66.6666)).toBe('66,67');
	});
});

describe('bangunBarisIku', () => {
	it('memenuhi: baris data + SATU baris analisis gabungan (colspan 5), judul tebal lalu isi, tanpa baris pemisah', () => {
		const [data, analisis] = bangunBarisIku(iku, sukses);
		expect(selData(data)).toEqual(['1', 'Indikator satu', '4', '100%|Skor 4', 'Memenuhi standar']);
		expect(analisis.content).toHaveLength(1);
		expect(analisis.content![0].attrs).toMatchObject({ colspan: 5 });
		expect(isiAnalisis(analisis)).toEqual([
			['Analisis Ketercapaian', true],
			['analisis', false],
			['Usulan Target Tahun Depan', true],
			['usulan', false],
			['Strategi Pencapaian', true],
			['1) a', false],
			['2) b', false],
			['Sarpras yang Dibutuhkan', true],
			['1) x', false],
		]);
	});

	it('melampaui: persen > 100, tanpa bagian tambahan walau ada', () => {
		const [data, analisis] = bangunBarisIku({ ...iku, target: '3' }, { ...sukses, score: 3.5, tambahan: { faktorPendukung: 'x' } });
		expect(selData(data)).toEqual(['1', 'Indikator satu', '3', '116,67%|Skor 3,5', 'Melampaui standar']);
		expect(isiAnalisis(analisis).filter(([, tebal]) => tebal).map(([t]) => t)).not.toContain('Faktor Pendukung');
	});

	it('belum memenuhi: hanya empat bagian tambahan dalam satu baris gabungan', () => {
		const [data, analisis] = bangunBarisIku(iku, {
			...sukses,
			score: 3.5,
			tambahan: { faktorPendukung: 'p', faktorPenghambat: 'h', akarMasalah: 'm', tindakLanjut: 't' },
		});
		expect(selData(data)[3]).toBe('87,5%|Skor 3,5');
		expect(selData(data)[4]).toBe('Belum memenuhi standar');
		expect(analisis.content).toHaveLength(1);
		expect(isiAnalisis(analisis)).toEqual([
			['Faktor Pendukung', true],
			['p', false],
			['Faktor Penghambat', true],
			['h', false],
			['Akar Masalah', true],
			['m', false],
			['Tindak Lanjut', true],
			['t', false],
		]);
	});

	it('belum memenuhi tanpa objek tambahan → judul tetap ada, isi kosong, tidak dikarang', () => {
		const [, analisis] = bangunBarisIku(iku, { ...sukses, score: 2 });
		expect(isiAnalisis(analisis).filter(([, tebal]) => tebal).map(([t]) => t)).toEqual([
			'Faktor Pendukung',
			'Faktor Penghambat',
			'Akar Masalah',
			'Tindak Lanjut',
		]);
		expect(isiAnalisis(analisis)[1]).toEqual(['', false]);
	});

	it('IKU error: capaian berisi keterangan, evaluasi kosong, analisis kosong', () => {
		const [data, analisis] = bangunBarisIku(iku, { kode: '1', error: 'Variabel rumus tidak ditemukan: NDTPS' });
		expect(selData(data)[3]).toBe('Variabel rumus tidak ditemukan: NDTPS');
		expect(data.content![4].content![0]).toEqual({ type: 'paragraph' });
		expect(isiAnalisis(analisis).filter(([, tebal]) => !tebal).every(([t]) => t === '')).toBe(true);
	});

	it('hasil hilang (job dibatalkan) diperlakukan sebagai capaian tidak ditemukan', () => {
		expect(selData(bangunBarisIku(iku, undefined)[0])[3]).toBe('Capaian tidak ditemukan');
	});
});

describe('bangunTabelSetor (satu tabel untuk semua indikator)', () => {
	const list = [iku, { kode: '2', indikator: 'Dua', target: '1' }, { kode: '3', indikator: 'Tiga', target: '2' }];
	const tabel = bangunTabelSetor(list, [{ ...sukses, kode: '2', score: 1 }, { kode: '1', error: 'x' }]);

	it('satu table: satu header lima kolom, lalu dua baris per indikator (urut ikuList)', () => {
		expect(tabel.type).toBe('table');
		expect(tabel.content).toHaveLength(1 + list.length * 2);
		expect(selData(tabel.content![0])).toEqual(['No', 'Indikator', 'Target', 'Capaian', 'Evaluasi']);
		const kode = tabel.content!.slice(1).map((r) => (r.content!.length === 5 ? selData(r)[0] : null));
		expect(kode).toEqual(['1', null, '2', null, '3', null]);
	});

	it('hasil dipasangkan lewat kode, bukan posisi; indikator tanpa hasil jadi "tidak ditemukan"', () => {
		expect(selData(tabel.content![1])[3]).toBe('x');
		expect(selData(tabel.content![3])[4]).toBe('Memenuhi standar');
		expect(selData(tabel.content![5])[3]).toBe('Capaian tidak ditemukan');
	});
});

describe('bangunDokumenSetor', () => {
	it('isi kanvas draft baru: satu tabel lalu satu paragraf kosong', () => {
		const doc = bangunDokumenSetor([iku], [sukses]);
		expect(doc.type).toBe('doc');
		expect(doc.content!.map((n) => n.type)).toEqual(['table', 'paragraph']);
	});
});

describe('aturCentang (skor bawaan 2)', () => {
	it('dicentang tanpa skor → skor 2', () => {
		expect(aturCentang({ dipilih: false, skor: null }, true)).toEqual({ dipilih: true, skor: 2 });
	});

	it('skor yang sudah dipilih dipertahankan saat dicentang ulang', () => {
		expect(aturCentang({ dipilih: false, skor: 4 }, true)).toEqual({ dipilih: true, skor: 4 });
	});

	it('membatalkan centang tidak mengubah skor (boleh dipertahankan di state lokal)', () => {
		expect(aturCentang({ dipilih: true, skor: 3 }, false)).toEqual({ dipilih: false, skor: 3 });
		expect(aturCentang({ dipilih: true, skor: 2 }, false)).toEqual({ dipilih: false, skor: 2 });
	});

	it('skor bawaan langsung lolos validasi payload (tidak memicu "pilih skor")', () => {
		const p = aturCentang({ dipilih: false, skor: null }, true);
		expect(susunPayload(IND, { a: p })).toEqual({ ok: true, ikuList: [{ kode: '1', indikator: 'Indikator satu', target: '2' }] });
	});
});
