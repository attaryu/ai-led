import * as React from 'react';

import { chapterRepository } from '~/features/chapter/data/repositories/chapter.repository';
import { type ChapterEntity } from '~/features/chapter/domain/entities/chapter.entity';
import { evidenceRepository } from '~/features/evidence/data/repositories/evidence.repository';
import { type EvidenceEntity } from '~/features/evidence/domain/entities/evidence.entity';
import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import { type LedProjectEntity } from '~/features/led-project/domain/entities/led-project.entity';
import { studyProgramRepository } from '~/features/study-program/data/repositories/study-program.repository';
import { userRepository } from '~/features/users/data/repositories/user.repository';
import { type UserEntity } from '~/features/users/domain/entities/user.entity';
import {
	buildInstitutionReadiness,
	type InstitutionReadiness,
} from '../../domain/entities/institution-readiness.entity';

/** Mengelompokkan satu koleksi menurut kuncinya dalam satu lintasan. */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
	const grouped = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		const bucket = grouped.get(k);
		if (bucket) bucket.push(item);
		else grouped.set(k, [item]);
	}
	return grouped;
}

/**
 * Membaca tiap koleksi **sekali** lalu mengelompokkannya di memori.
 *
 * Sengaja tidak memakai ulang `useProgramReadiness` dalam perulangan: hook itu
 * bertanya per prodi (`findByStudyProgramId`, `findOwnedByStudyProgram`,
 * `findPenyusunByStudyProgramId`), dan tiap pertanyaan itu membaca lalu
 * mem-parse **seluruh** koleksi dari localStorage. Untuk N prodi itu berarti N
 * kali parse tiap koleksi, tiap render, tiap `storage-update` — pekerjaan yang
 * tumbuh linear padahal datanya sama persis.
 *
 * Aturan hitungnya tetap yang sama; yang berbeda hanya berapa kali datanya
 * dibaca.
 */
async function read(): Promise<InstitutionReadiness> {
	// `userRepository` masih mock lokal (belum ada endpoint backend-nya — lihat
	// catatan migrasi tracker), jadi tetap sinkron. `.catch(() => [])` menjaga
	// dashboard tetap tampil kalau viewer bukan Pimpinan/Penjamin Mutu (satu-
	// satunya yang boleh baca level tenant untuk evidence — lihat `bukti-dukung.
	// service.ts::findAll`) walau halaman ini biasanya cuma dibuka mereka.
	const [programs, projects, chapters, evidences]: [
		Awaited<ReturnType<typeof studyProgramRepository.findAll>>,
		LedProjectEntity[],
		ChapterEntity[],
		EvidenceEntity[],
	] = await Promise.all([
		studyProgramRepository.findAll(),
		ledProjectRepository.findAll(),
		chapterRepository.findAll(),
		evidenceRepository.findAllTenant().catch(() => []),
	]);
	const users: UserEntity[] = userRepository.findAll();

	return buildInstitutionReadiness({
		programs,
		projectsByProgram: groupBy(projects, (project) => project.studyProgramId),
		/*
		 * Dibaca apa adanya, bukan lewat `chapterRepository.findByProjectId` yang
		 * ikut *membuat* bab untuk dokumen lama (§6.1b). Halaman ini murni baca:
		 * pembuatan bab adalah pekerjaan lapis dokumen, dan memicunya dari sini
		 * berarti membuka satu halaman ringkasan diam-diam menulis ke penyimpanan.
		 * Konsekuensinya dokumen yang belum punya bab terbaca `0/0` sampai
		 * dashboard dokumennya dibuka — itu memang keadaan sebenarnya.
		 */
		chaptersByProject: groupBy(chapters, (chapter) => chapter.ledProjectId),
		penyusunByProgram: groupBy(
			users.filter(
				(user) => user.role === 'Penyusun' && Boolean(user.studyProgramId),
			),
			(user) => user.studyProgramId!,
		),
		evidenceTenant: evidences.filter(
			(evidence) => evidence.ownerTipe === 'TENANT',
		),
	});
}

/**
 * Seluruh angka Dashboard Utama dalam satu tempat (docs/application_flow.md
 * §4.0), supaya halaman tinggal merender.
 *
 * Berlangganan `storage-update` seperti daftar lain di aplikasi ini: datanya
 * berubah dari halaman lain — Penjamin Mutu membuat Dokumen LED baru, bukti
 * dukung selesai diekstraksi, Pimpinan menugaskan Penyusun ke prodi.
 */
const EMPTY_READINESS = buildInstitutionReadiness({
	programs: [],
	projectsByProgram: new Map(),
	chaptersByProject: new Map(),
	penyusunByProgram: new Map(),
	evidenceTenant: [],
});

export function useInstitutionReadiness(): InstitutionReadiness {
	const [readiness, setReadiness] =
		React.useState<InstitutionReadiness>(EMPTY_READINESS);

	React.useEffect(() => {
		const load = () => {
			read().then(setReadiness);
		};
		load();
		window.addEventListener('storage-update', load);
		return () => window.removeEventListener('storage-update', load);
	}, []);

	return readiness;
}
