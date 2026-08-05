import { chapterRepository } from '~/features/chapter/data/repositories/chapter.repository';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';
import { ledProjectLocalSource } from '../sources/local/led-project-local.source';

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

	update(id: string, data: Partial<LedProjectEntity>): void {
		const projects = this.findAll();
		const updated = projects.map((p) => (p.id === id ? { ...p, ...data } : p));
		this.save(updated);
	},
};
