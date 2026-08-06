import {
	type PeringkatAkreditasi,
	type StudyProgramEntity,
} from '../../domain/entities/study-program.entity';
import { studyProgramLocalSource } from '../sources/local/study-program-local.source';

/** Tanggal ISO relatif terhadap hari ini, supaya data contoh tidak basi. */
function inDays(days: number): string {
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

const initialStudyPrograms: StudyProgramEntity[] = [
	{
		id: '1',
		studyProgramName: 'Teknik Informatika',
		kode: '55201',
		jenjang: 'S1',
		fakultas: 'Fakultas Teknik',
		ketuaProdi: 'Dr. Andi Nugroho, S.T., M.Kom.',
		peringkatAkreditasi: 'BAIK_SEKALI',
		nomorSkAkreditasi: '1234/SK/LAM-Teknik/AK/S/VIII/2022',
		berlakuSampaiAkreditasi: inDays(740),
		createdAt: '2026-07-29T10:00:00.000Z',
	},
	{
		id: '2',
		studyProgramName: 'Sistem Informasi',
		kode: '57201',
		jenjang: 'S1',
		fakultas: 'Fakultas Teknik',
		ketuaProdi: 'Rina Marlina, S.Kom., M.T.',
		peringkatAkreditasi: 'BAIK',
		nomorSkAkreditasi: '0871/SK/LAM-Teknik/AK/S/III/2022',
		// Sengaja di bawah setahun supaya keadaan "MENDEKATI" ada wujudnya.
		berlakuSampaiAkreditasi: inDays(228),
		createdAt: '2026-07-29T10:15:00.000Z',
	},
	{
		id: '3',
		studyProgramName: 'Teknik Elektro',
		kode: '20201',
		jenjang: 'S1',
		fakultas: 'Fakultas Teknik',
		ketuaProdi: 'Ir. Slamet Haryanto, M.T.',
		peringkatAkreditasi: 'UNGGUL',
		nomorSkAkreditasi: '0456/SK/LAM-Teknik/AK/S/I/2024',
		berlakuSampaiAkreditasi: inDays(1620),
		createdAt: '2026-07-29T10:30:00.000Z',
	},
	{
		id: '4',
		studyProgramName: 'Teknik Mesin',
		kode: '21201',
		jenjang: 'D4',
		fakultas: 'Fakultas Teknik',
		ketuaProdi: 'Bagas Prakoso, S.T., M.Eng.',
		// Prodi baru: belum terakreditasi, belum punya Dokumen LED, belum punya
		// Penyusun. Dipakai untuk membuktikan keadaan kosong Dashboard Prodi.
		peringkatAkreditasi: 'BELUM_TERAKREDITASI',
		nomorSkAkreditasi: null,
		berlakuSampaiAkreditasi: null,
		createdAt: '2026-07-29T10:45:00.000Z',
	},
];

/**
 * Mengisi field yang belum ada pada baris lama di localStorage.
 *
 * `findAll` mem-parse JSON tanpa memvalidasinya ke skema, jadi baris yang
 * tersimpan sebelum identitas akreditasi ditambahkan akan lolos sebagai objek
 * setengah jadi dan merender `undefined` di layar. Menormalkannya di sini lebih
 * murah daripada memaksa pengguna mengosongkan penyimpanan peramban.
 */
function normalize(program: Partial<StudyProgramEntity>): StudyProgramEntity {
	return {
		id: program.id ?? '',
		studyProgramName: program.studyProgramName ?? '',
		kode: program.kode ?? '—',
		jenjang: program.jenjang ?? 'S1',
		fakultas: program.fakultas ?? 'Belum diisi',
		ketuaProdi: program.ketuaProdi ?? 'Belum diisi',
		peringkatAkreditasi:
			(program.peringkatAkreditasi as PeringkatAkreditasi | undefined) ??
			'BELUM_TERAKREDITASI',
		nomorSkAkreditasi: program.nomorSkAkreditasi ?? null,
		berlakuSampaiAkreditasi: program.berlakuSampaiAkreditasi ?? null,
		createdAt: program.createdAt ?? new Date().toISOString(),
	};
}

export const studyProgramRepository = {
	findAll(): StudyProgramEntity[] {
		const stored = studyProgramLocalSource.getAll();
		if (!stored) {
			this.save(initialStudyPrograms);
			return initialStudyPrograms;
		}
		try {
			return (JSON.parse(stored) as Partial<StudyProgramEntity>[]).map(
				normalize,
			);
		} catch (e) {
			this.save(initialStudyPrograms);
			return initialStudyPrograms;
		}
	},

	save(programs: StudyProgramEntity[]): void {
		studyProgramLocalSource.setAll(JSON.stringify(programs));
	},

	/**
	 * Satu-satunya jalan menambah prodi. Sebelumnya halaman formulir menulis ke
	 * localStorage sendiri; dengan identitas akreditasi ikut disimpan, jalan
	 * pintas itu jadi tempat field baru gampang terlupakan.
	 */
	create(program: StudyProgramEntity): void {
		this.save([...this.findAll(), program]);
		window.dispatchEvent(new Event('storage-update'));
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
