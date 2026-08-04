import { type LedProjectEntity } from '../../domain/entities/led-project.entity';
import { ledProjectLocalSource } from '../sources/local/led-project-local.source';

const initialLedProjects: LedProjectEntity[] = [
	{
		id: '1',
		studyProgramId: '1',
		studyProgramName: 'Teknik Informatika',
		judul: 'Akreditasi LED Teknik Informatika 2026',
		tahunAkademik: '2025/2026',
		statusKeseluruhan: 'DRAFT',
		createdAt: '2026-07-30T10:00:00.000Z',
	},
	{
		id: '2',
		studyProgramId: '2',
		studyProgramName: 'Sistem Informasi',
		judul: 'Laporan Evaluasi Diri Sistem Informasi 2026',
		tahunAkademik: '2025/2026',
		statusKeseluruhan: 'REVIEW',
		createdAt: '2026-07-30T10:15:00.000Z',
	},
	{
		id: '3',
		studyProgramId: '3',
		studyProgramName: 'Teknik Elektro',
		judul: 'LED Akreditasi LAM-TEKNIK Teknik Elektro',
		tahunAkademik: '2026/2027',
		statusKeseluruhan: 'SELESAI',
		createdAt: '2026-07-30T10:30:00.000Z',
	},
];

export const ledProjectRepository = {
	findAll(): LedProjectEntity[] {
		const stored = ledProjectLocalSource.getAll();
		if (!stored) {
			this.save(initialLedProjects);
			return initialLedProjects;
		}
		try {
			return JSON.parse(stored);
		} catch (e) {
			this.save(initialLedProjects);
			return initialLedProjects;
		}
	},

	save(projects: LedProjectEntity[]): void {
		ledProjectLocalSource.setAll(JSON.stringify(projects));
	},

	delete(id: string): void {
		const projects = this.findAll();
		const updated = projects.filter((p) => p.id !== id);
		this.save(updated);
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
