import { chapterRepository } from '~/features/chapter/data/repositories/chapter.repository';
import {
	type LedProjectPage,
	type LedProjectQueryDto,
} from '../../domain/dtos/led-project-query.dto';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';
import { ledProjectLocalSource } from '../sources/local/led-project-local.source';

/** Nilai urut yang dipakai kolom `status` supaya urutannya bermakna, bukan A-Z. */
const statusOrder: Record<LedProjectEntity['statusKeseluruhan'], number> = {
	DRAFT: 0,
	REVIEW: 1,
	SELESAI: 2,
};

function compare(
	a: LedProjectEntity,
	b: LedProjectEntity,
	sort: string,
): number {
	switch (sort) {
		case 'statusKeseluruhan':
			return statusOrder[a.statusKeseluruhan] - statusOrder[b.statusKeseluruhan];
		case 'tahunAkademik':
			return a.tahunAkademik.localeCompare(b.tahunAkademik);
		case 'studyProgramName':
			return a.studyProgramName.localeCompare(b.studyProgramName, 'id');
		case 'createdAt':
			return a.createdAt.localeCompare(b.createdAt);
		case 'tenggat':
			// Dokumen tanpa tenggat selalu di ujung: ia tidak punya posisi alami di
			// antara tanggal, dan menaruhnya di awal akan mengubur yang mendesak.
			if (a.tenggat === b.tenggat) return 0;
			if (a.tenggat === null) return 1;
			if (b.tenggat === null) return -1;
			return a.tenggat.localeCompare(b.tenggat);
		default:
			return a.judul.localeCompare(b.judul, 'id');
	}
}

/** Tanggal ISO relatif terhadap hari ini, supaya data contoh tidak basi. */
function inDays(days: number): string {
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

const initialLedProjects: LedProjectEntity[] = [
	{
		id: '1',
		studyProgramId: '1',
		studyProgramName: 'Teknik Informatika',
		judul: 'Akreditasi LED Teknik Informatika 2026',
		tahunAkademik: '2025/2026',
		statusKeseluruhan: 'DRAFT',
		// Di bawah 30 hari: keadaan "tenggat dekat" punya wujud tanpa perlu diedit.
		tenggat: inDays(23),
		createdAt: '2026-07-30T10:00:00.000Z',
	},
	{
		id: '2',
		studyProgramId: '2',
		studyProgramName: 'Sistem Informasi',
		judul: 'Laporan Evaluasi Diri Sistem Informasi 2026',
		tahunAkademik: '2025/2026',
		statusKeseluruhan: 'REVIEW',
		tenggat: inDays(-6),
		createdAt: '2026-07-30T10:15:00.000Z',
	},
	{
		id: '3',
		studyProgramId: '3',
		studyProgramName: 'Teknik Elektro',
		judul: 'LED Akreditasi LAM-TEKNIK Teknik Elektro',
		tahunAkademik: '2026/2027',
		statusKeseluruhan: 'SELESAI',
		tenggat: null,
		createdAt: '2026-07-30T10:30:00.000Z',
	},
	{
		// Siklus lama Teknik Informatika, supaya bentuk "satu siklus aktif +
		// arsip" di Dashboard Prodi benar-benar terlihat.
		id: '4',
		studyProgramId: '1',
		studyProgramName: 'Teknik Informatika',
		judul: 'Laporan Evaluasi Diri Teknik Informatika 2022',
		tahunAkademik: '2021/2022',
		statusKeseluruhan: 'SELESAI',
		tenggat: null,
		createdAt: '2022-08-01T10:00:00.000Z',
	},
];

/**
 * Mengisi `tenggat` untuk baris lama di localStorage. `findAll` mem-parse JSON
 * tanpa memvalidasinya ke skema, jadi tanpa ini dokumen yang tersimpan sebelum
 * kolomnya ada akan bernilai `undefined` — yang tidak sama dengan `null` bagi
 * `deriveDeadline`.
 */
function normalize(project: Partial<LedProjectEntity>): LedProjectEntity {
	return { ...(project as LedProjectEntity), tenggat: project.tenggat ?? null };
}

export const ledProjectRepository = {
	findAll(): LedProjectEntity[] {
		const stored = ledProjectLocalSource.getAll();
		if (!stored) {
			this.save(initialLedProjects);
			return initialLedProjects;
		}
		try {
			return (JSON.parse(stored) as Partial<LedProjectEntity>[]).map(normalize);
		} catch (e) {
			this.save(initialLedProjects);
			return initialLedProjects;
		}
	},

	save(projects: LedProjectEntity[]): void {
		ledProjectLocalSource.setAll(JSON.stringify(projects));
	},

	/**
	 * Satu-satunya jalan membuat Dokumen LED, supaya tidak ada dokumen yang lolos
	 * tanpa baris `BAB_DOKUMEN` — struktur bab standar memang dibuat otomatis
	 * bersamaan (docs/application_flow.md §7.3).
	 */
	create(project: LedProjectEntity): void {
		this.save([...this.findAll(), project]);
		chapterRepository.createForProject(project.id);
		window.dispatchEvent(new Event('storage-update'));
	},

	delete(id: string): void {
		const projects = this.findAll();
		const updated = projects.filter((p) => p.id !== id);
		this.save(updated);
		// Bab tidak punya arti tanpa dokumen induknya; dibiarkan hanya akan jadi
		// sampah yang ikut terhitung saat id dokumen kebetulan dipakai ulang.
		chapterRepository.deleteByProjectId(id);
	},

	findById(id: string): LedProjectEntity | undefined {
		return this.findAll().find((p) => p.id === id);
	},

	/**
	 * Penyaringan per prodi ditaruh di repository, bukan di halaman, supaya saat
	 * sumber datanya berpindah ke API nanti ia tinggal jadi query param tanpa
	 * menyentuh lapis presentasi.
	 */
	findByStudyProgramId(studyProgramId: string): LedProjectEntity[] {
		return this.findAll().filter((p) => p.studyProgramId === studyProgramId);
	},

	/**
	 * Daftar berhalaman untuk `DataTable`, yang berjalan dalam mode manual —
	 * pencarian, pengurutan, dan pemotongan halaman memang dianggap pekerjaan
	 * sisi sumber data (docs/application_flow.md §4.6), bukan sisi tampilan.
	 * Tanpa ini kotak pencarian tampil tapi tidak menyaring apa pun.
	 */
	findPaged(query: LedProjectQueryDto): LedProjectPage {
		const scoped = query.studyProgramId
			? this.findByStudyProgramId(query.studyProgramId)
			: this.findAll();

		const keyword = query.q?.trim().toLowerCase() ?? '';
		const filtered = keyword
			? scoped.filter(
					(project) =>
						project.judul.toLowerCase().includes(keyword) ||
						project.studyProgramName.toLowerCase().includes(keyword) ||
						project.tahunAkademik.toLowerCase().includes(keyword) ||
						project.statusKeseluruhan.toLowerCase().includes(keyword),
				)
			: scoped;

		// Tanpa pilihan urutan, yang terbaru di atas — siklus yang sedang berjalan
		// hampir selalu yang dicari, dan ia selalu yang termuda.
		const sortKey = query.sort ?? 'createdAt';
		const descending = query.sort ? query.dir === 'desc' : true;
		const sorted = [...filtered].sort((a, b) => {
			const result = compare(a, b, sortKey);
			return descending ? -result : result;
		});

		const start = (query.page - 1) * query.limit;
		return {
			items: sorted.slice(start, start + query.limit),
			total: sorted.length,
		};
	},

	update(id: string, data: Partial<LedProjectEntity>): void {
		const projects = this.findAll();
		const updated = projects.map((p) => (p.id === id ? { ...p, ...data } : p));
		this.save(updated);
	},
};
