import { describe, expect, it } from 'vitest';

import {
	buildActiveDocumentRows,
	summarizeActiveDocuments,
} from './active-documents.entity';

type Urgensi = 'LEWAT' | 'DEKAT' | 'AMAN';

const readiness = (
	id: string,
	name: string,
	opts: { aktif?: boolean; sisaHari?: number | null; terisi?: number; total?: number } = {},
) => {
	const aktif = opts.aktif ?? true;
	const sisaHari = opts.sisaHari === undefined ? 100 : opts.sisaHari;
	const urgensi: Urgensi | null =
		sisaHari === null ? null : sisaHari < 0 ? 'LEWAT' : sisaHari <= 30 ? 'DEKAT' : 'AMAN';
	return {
		program: { id: `p-${id}`, studyProgramName: name, jenjang: 'S1', fakultas: 'F' },
		penyusunanAktif: aktif ? { id: `d-${id}`, tahunAkademik: '2025/2026' } : null,
		chapterSummary: { terisi: opts.terisi ?? 0, total: opts.total ?? 5 },
		tenggat: urgensi && sisaHari !== null ? { sisaHari, urgensi } : null,
	} as never;
};

const overview = (
	id: string,
	opts: {
		status?: string;
		total?: number;
		ditinjau?: number;
		rendah?: number;
		gagal?: number;
		sesi?: boolean;
	} = {},
) =>
	({
		dokumenId: `d-${id}`,
		studyProgramId: `p-${id}`,
		sesi:
			opts.sesi === false
				? null
				: {
						id: `s-${id}`,
						status: opts.status ?? 'COMPLETED',
						totalIndicators: opts.total ?? 10,
						completedIndicators: opts.total ?? 10,
						createdAt: '2026-01-01',
					},
		dinilai: 10,
		gagal: opts.gagal ?? 0,
		skorRataRata: 3,
		jumlahSkorRendah: opts.rendah ?? 0,
		ditinjau: opts.ditinjau ?? 0,
		dikoreksi: 0,
	}) as never;

describe('buildActiveDocumentRows', () => {
	it('hanya memuat prodi yang punya dokumen aktif', () => {
		const rows = buildActiveDocumentRows({
			readiness: [readiness('1', 'A'), readiness('2', 'B', { aktif: false })],
			overviews: [],
		});
		expect(rows.map((r) => r.project.id)).toEqual(['d-1']);
	});

	it('menggabungkan bab, tenggat, dan ringkasan AMI per dokumen', () => {
		const [row] = buildActiveDocumentRows({
			readiness: [readiness('1', 'A', { sisaHari: 5, terisi: 4 })],
			overviews: [overview('1', { total: 10, ditinjau: 4, rendah: 3, gagal: 1 })],
		});
		expect(row.chapterSummary.terisi).toBe(4);
		expect(row.tenggat?.urgensi).toBe('DEKAT');
		expect(row.belumDitinjau).toBe(6);
		expect(row.perluPerhatian).toBe(4);
	});

	it('belumDitinjau hanya dihitung untuk sesi COMPLETED', () => {
		const [row] = buildActiveDocumentRows({
			readiness: [readiness('1', 'A')],
			overviews: [overview('1', { status: 'RUNNING' })],
		});
		expect(row.belumDitinjau).toBe(0);
	});

	it('belumDitinjau tidak pernah negatif', () => {
		const [row] = buildActiveDocumentRows({
			readiness: [readiness('1', 'A')],
			overviews: [overview('1', { total: 10, ditinjau: 12 })],
		});
		expect(row.belumDitinjau).toBe(0);
	});

	it('dokumen tanpa ringkasan AMI atau tanpa sesi tetap muncul dengan angka nol', () => {
		const rows = buildActiveDocumentRows({
			readiness: [readiness('1', 'A'), readiness('2', 'B')],
			overviews: [overview('2', { sesi: false })],
		});
		expect(rows[0].overview).toBeNull();
		expect(rows.every((r) => r.belumDitinjau === 0 && r.perluPerhatian === 0)).toBe(true);
	});

	it('overviews null (endpoint gagal) tidak menjatuhkan baris dokumen', () => {
		const [row] = buildActiveDocumentRows({
			readiness: [readiness('1', 'A', { terisi: 2 })],
			overviews: null,
		});
		expect(row.overview).toBeNull();
		expect(row.chapterSummary.terisi).toBe(2);
	});

	it('dokumen tanpa bab tetap menjadi baris', () => {
		const rows = buildActiveDocumentRows({
			readiness: [readiness('1', 'A', { terisi: 0, total: 0 })],
			overviews: [],
		});
		expect(rows).toHaveLength(1);
	});

	it('mengurutkan: LEWAT, DEKAT, AMAN, lalu tanpa tenggat', () => {
		const rows = buildActiveDocumentRows({
			readiness: [
				readiness('n', 'Null', { sisaHari: null }),
				readiness('a', 'Aman', { sisaHari: 75 }),
				readiness('d', 'Dekat', { sisaHari: 21 }),
				readiness('l', 'Lewat', { sisaHari: -12 }),
			],
			overviews: [],
		});
		expect(rows.map((r) => r.program.studyProgramName)).toEqual([
			'Lewat',
			'Dekat',
			'Aman',
			'Null',
		]);
	});

	it('di dalam urgensi yang sama, sisa hari terkecil dulu', () => {
		const rows = buildActiveDocumentRows({
			readiness: [
				readiness('1', 'A', { sisaHari: 20 }),
				readiness('2', 'B', { sisaHari: 3 }),
			],
			overviews: [],
		});
		expect(rows.map((r) => r.program.studyProgramName)).toEqual(['B', 'A']);
	});

	it('tenggat seri: belum ditinjau terbanyak dulu, lalu nama', () => {
		const rows = buildActiveDocumentRows({
			readiness: [
				readiness('1', 'Zeta', { sisaHari: 10 }),
				readiness('2', 'Alfa', { sisaHari: 10 }),
				readiness('3', 'Beta', { sisaHari: 10 }),
				readiness('4', 'Gamma', { sisaHari: 10 }),
			],
			overviews: [
				overview('1', { ditinjau: 5 }),
				overview('3', { ditinjau: 5 }),
				overview('4', { ditinjau: 0 }),
			],
		});
		expect(rows.map((r) => r.program.studyProgramName)).toEqual([
			'Gamma',
			'Beta',
			'Zeta',
			'Alfa',
		]);
	});
});

describe('summarizeActiveDocuments', () => {
	const rows = buildActiveDocumentRows({
		readiness: [
			readiness('mesin', 'Mesin', { sisaHari: -12 }),
			readiness('ti', 'TI', { sisaHari: 21 }),
			readiness('si', 'SI', { sisaHari: 75 }),
			readiness('man', 'Manajemen', { sisaHari: null }),
		],
		overviews: [
			overview('ti', { ditinjau: 5, rendah: 2 }),
			overview('si', { ditinjau: 0, gagal: 1 }),
		],
	});

	it('menghitung kartu dalam satuan dokumen', () => {
		expect(summarizeActiveDocuments(rows, true)).toEqual({
			dokumenAktif: 4,
			tenggatMendesak: 2,
			perluDitinjau: 2,
		});
	});

	it('kartu AMI null bila ringkasan AMI tidak tersedia, kartu dokumen tetap', () => {
		const noAmi = buildActiveDocumentRows({
			readiness: [readiness('1', 'A', { sisaHari: -1 })],
			overviews: null,
		});
		expect(summarizeActiveDocuments(noAmi, false)).toEqual({
			dokumenAktif: 1,
			tenggatMendesak: 1,
			perluDitinjau: null,
		});
	});

	it('sesi RUNNING, FAILED, atau tanpa sesi tidak dihitung perlu ditinjau', () => {
		const campur = buildActiveDocumentRows({
			readiness: [
				readiness('1', 'A'),
				readiness('2', 'B'),
				readiness('3', 'C'),
				readiness('4', 'D'),
			],
			overviews: [
				overview('1', { status: 'RUNNING' }),
				overview('2', { status: 'FAILED' }),
				overview('3', { sesi: false }),
			],
		});
		expect(summarizeActiveDocuments(campur, true).perluDitinjau).toBe(0);
	});

	it('sesi COMPLETED yang seluruh indikatornya sudah ditinjau tidak dihitung', () => {
		const tuntas = buildActiveDocumentRows({
			readiness: [readiness('1', 'A'), readiness('2', 'B')],
			overviews: [
				overview('1', { total: 10, ditinjau: 10 }),
				overview('2', { total: 10, ditinjau: 9 }),
			],
		});
		expect(summarizeActiveDocuments(tuntas, true).perluDitinjau).toBe(1);
	});

	it('prodi tanpa dokumen aktif tidak dihitung', () => {
		const campur = buildActiveDocumentRows({
			readiness: [readiness('1', 'A'), readiness('2', 'B', { aktif: false })],
			overviews: [],
		});
		expect(summarizeActiveDocuments(campur, true).dokumenAktif).toBe(1);
	});

	it('tanpa dokumen aktif semuanya nol', () => {
		expect(summarizeActiveDocuments([], true)).toEqual({
			dokumenAktif: 0,
			tenggatMendesak: 0,
			perluDitinjau: 0,
		});
	});
});
