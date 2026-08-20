import { ApiError } from '~/core/lib/api-client';
import { CHAPTER_TEMPLATE } from '~/features/chapter/data/repositories/chapter.repository';
import { chapterRemoteSource } from '~/features/chapter/data/sources/remote/chapter.remote-source';
import { studyProgramRepository } from '~/features/study-program/data/repositories/study-program.repository';
import {
	type LedProjectPage,
	type LedProjectQueryDto,
} from '../../domain/dtos/led-project-query.dto';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';
import {
	ledProjectRemoteSource,
	type BackendDokumenLed,
	type DokumenLedUpdatePayload,
} from '../sources/remote/led-project.remote-source';

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

function toEntity(row: BackendDokumenLed, studyProgramName: string): LedProjectEntity {
	return {
		id: row.id,
		studyProgramId: row.programStudiId,
		studyProgramName,
		judul: row.judul,
		tahunAkademik: row.tahunAkademik,
		statusKeseluruhan: row.statusKeseluruhan,
		tenggat: row.tenggat,
		createdAt: row.dibuatPada,
	};
}

export const ledProjectRepository = {
	/**
	 * Lintas prodi, dua request tetap (dokumen + nama prodi), bukan 1+N —
	 * `/dokumen` mengembalikan seluruh tenant sekaligus (notes attar.md #6).
	 * Dijangkau hanya dari lapis tenant (§1), yang sudah menolak Penyusun —
	 * backend sendiri akan menolak 403 bila Penyusun mencoba prodi lain.
	 */
	async findAll(): Promise<LedProjectEntity[]> {
		const [rows, programs] = await Promise.all([
			ledProjectRemoteSource.findAllForTenant(),
			studyProgramRepository.findAll(),
		]);
		const namesById = new Map(programs.map((p) => [p.id, p.studyProgramName]));
		return rows.map((row) =>
			toEntity(row, namesById.get(row.programStudiId) ?? '(Prodi tidak diketahui)'),
		);
	},

	async findById(id: string): Promise<LedProjectEntity | undefined> {
		try {
			const row = await ledProjectRemoteSource.findById(id);
			const program = await studyProgramRepository.findById(row.programStudiId);
			return toEntity(row, program?.studyProgramName ?? '(Prodi tidak diketahui)');
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) return undefined;
			throw e;
		}
	},

	/**
	 * Satu-satunya jalan membuat Dokumen LED, supaya tidak ada dokumen yang lolos
	 * tanpa struktur bab standar (§7.3) — backend tidak membuatnya otomatis
	 * (dikonfirmasi dari `dokumen-led.service.ts`), jadi 14 bab dipateraikan di
	 * sini lewat request terpisah begitu dokumennya sendiri berhasil dibuat.
	 */
	async create(data: {
		studyProgramId: string;
		judul: string;
		tahunAkademik: string;
		tenggat: string | null;
	}): Promise<LedProjectEntity> {
		const created = await ledProjectRemoteSource.create(data.studyProgramId, {
			judul: data.judul,
			tahunAkademik: data.tahunAkademik,
			tenggat: data.tenggat ?? undefined,
		});

		await Promise.all(
			CHAPTER_TEMPLATE.map((bab) => chapterRemoteSource.create(created.id, bab)),
		);

		const program = await studyProgramRepository.findById(data.studyProgramId);
		window.dispatchEvent(new Event('storage-update'));
		return toEntity(created, program?.studyProgramName ?? '(Prodi tidak diketahui)');
	},

	async delete(id: string): Promise<void> {
		// Sesi penilaian AMI & keputusan Penjamin Mutu sekarang baris Postgres
		// sungguhan (AssessmentSession/AssessmentVerdict, FK ke dokumen_led) --
		// dokumen yang masih punya riwayat penilaian akan ditolak server (FK
		// constraint), sama seperti dokumen yang masih punya bab.
		await ledProjectRemoteSource.remove(id);
		window.dispatchEvent(new Event('storage-update'));
	},

	findByStudyProgramId(studyProgramId: string): Promise<LedProjectEntity[]> {
		return Promise.all([
			ledProjectRemoteSource.findAllForProgramStudi(studyProgramId),
			studyProgramRepository.findById(studyProgramId),
		]).then(([rows, program]) => {
			const name = program?.studyProgramName ?? '(Prodi tidak diketahui)';
			return rows.map((row) => toEntity(row, name));
		});
	},

	/**
	 * Daftar berhalaman untuk `DataTable`, yang berjalan dalam mode manual —
	 * pencarian, pengurutan, dan pemotongan halaman memang dianggap pekerjaan
	 * sisi sumber data (docs/application_flow.md §4.6), bukan sisi tampilan.
	 * Backend tidak menyediakan parameter query untuk ini, jadi tetap dikerjakan
	 * di sini seperti sebelumnya — hanya sumber datanya yang sekarang jaringan.
	 */
	async findPaged(query: LedProjectQueryDto): Promise<LedProjectPage> {
		const scoped = query.studyProgramId
			? await this.findByStudyProgramId(query.studyProgramId)
			: await this.findAll();

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

		// Tanpa pilihan urutan, yang terbaru di atas — dokumen yang sedang disusun
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

	/**
	 * `studyProgramId` sengaja tidak pernah dikirim ke backend: `UpdateDokumenLedDto`
	 * tidak punya field itu — endpoint ini tidak bisa memindahkan dokumen ke
	 * prodi lain.
	 */
	async update(
		id: string,
		data: Partial<Omit<LedProjectEntity, 'id' | 'createdAt'>>,
	): Promise<LedProjectEntity> {
		const payload: DokumenLedUpdatePayload = {};
		if (data.judul !== undefined) payload.judul = data.judul;
		if (data.tahunAkademik !== undefined) payload.tahunAkademik = data.tahunAkademik;
		if (data.statusKeseluruhan !== undefined)
			payload.statusKeseluruhan = data.statusKeseluruhan;
		if (data.tenggat !== undefined) payload.tenggat = data.tenggat ?? undefined;

		const updated = await ledProjectRemoteSource.update(id, payload);
		const program = await studyProgramRepository.findById(updated.programStudiId);
		window.dispatchEvent(new Event('storage-update'));
		return toEntity(updated, program?.studyProgramName ?? '(Prodi tidak diketahui)');
	},
};
