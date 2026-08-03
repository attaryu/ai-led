import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';
import { studyProgramLocalSource } from '../sources/local/study-program-local.source';

const initialStudyPrograms: StudyProgramEntity[] = [
	{
		id: '1',
		studyProgramName: 'Teknik Informatika',
		createdAt: '2026-07-29T10:00:00.000Z',
	},
	{
		id: '2',
		studyProgramName: 'Sistem Informasi',
		createdAt: '2026-07-29T10:15:00.000Z',
	},
	{
		id: '3',
		studyProgramName: 'Teknik Elektro',
		createdAt: '2026-07-29T10:30:00.000Z',
	},
];

export const studyProgramRepository = {
	findAll(): StudyProgramEntity[] {
		const stored = studyProgramLocalSource.getAll();
		if (!stored) {
			this.save(initialStudyPrograms);
			return initialStudyPrograms;
		}
		try {
			return JSON.parse(stored);
		} catch (e) {
			this.save(initialStudyPrograms);
			return initialStudyPrograms;
		}
	},

	save(programs: StudyProgramEntity[]): void {
		studyProgramLocalSource.setAll(JSON.stringify(programs));
	},

	delete(id: string): void {
		const programs = this.findAll();
		const updated = programs.filter((p) => p.id !== id);
		this.save(updated);

		// Clean up users referencing deleted prodi
		const storedUsers = localStorage.getItem('user_data');
		if (storedUsers) {
			try {
				const users = JSON.parse(storedUsers);
				const updatedUsers = users.map((u: any) => {
					if (
						u.role === 'Penyusun' &&
						!updated.some((p) => p.id === u.studyProgramId)
					) {
						return {
							...u,
							studyProgramId: null,
							studyProgramName: '(Prodi Terhapus)',
						};
					}
					return u;
				});
				localStorage.setItem('user_data', JSON.stringify(updatedUsers));
				// Dispatch custom event to notify user table to update
				window.dispatchEvent(new Event('storage-update'));
			} catch (e) {
				console.error(e);
			}
		}

		// Clean up LED projects referencing deleted prodi (cascade delete projects or update studyProgramName)
		const storedProjects = localStorage.getItem('led_project_data');
		if (storedProjects) {
			try {
				const projects = JSON.parse(storedProjects);
				const updatedProjects = projects.filter((p: any) => updated.some((sp) => sp.id === p.studyProgramId));
				localStorage.setItem('led_project_data', JSON.stringify(updatedProjects));
				window.dispatchEvent(new Event('storage-update'));
			} catch (e) {
				console.error(e);
			}
		}
	},

	findById(id: string): StudyProgramEntity | undefined {
		return this.findAll().find((p) => p.id === id);
	},

	update(id: string, data: Partial<StudyProgramEntity>): void {
		const programs = this.findAll();
		const updated = programs.map((p) => (p.id === id ? { ...p, ...data } : p));
		this.save(updated);

		// Cascade update to users referencing this prodi
		if (data.studyProgramName) {
			const storedUsers = localStorage.getItem('user_data');
			if (storedUsers) {
				try {
					const users = JSON.parse(storedUsers);
					const updatedUsers = users.map((u: any) => {
						if (u.studyProgramId === id) {
							return {
								...u,
								studyProgramName: data.studyProgramName,
							};
						}
						return u;
					});
					localStorage.setItem('user_data', JSON.stringify(updatedUsers));
					window.dispatchEvent(new Event('storage-update'));
				} catch (e) {
					console.error(e);
				}
			}

			// Cascade update to LED projects referencing this prodi
			const storedProjects = localStorage.getItem('led_project_data');
			if (storedProjects) {
				try {
					const projects = JSON.parse(storedProjects);
					const updatedProjects = projects.map((p: any) => {
						if (p.studyProgramId === id) {
							return {
								...p,
								studyProgramName: data.studyProgramName,
							};
						}
						return p;
					});
					localStorage.setItem('led_project_data', JSON.stringify(updatedProjects));
					window.dispatchEvent(new Event('storage-update'));
				} catch (e) {
					console.error(e);
				}
			}
		}
	},
};
