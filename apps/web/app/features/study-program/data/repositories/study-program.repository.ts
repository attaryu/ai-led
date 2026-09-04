import { ApiError } from '~/core/lib/api-client';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';
import {
	studyProgramRemoteSource,
	type BackendProgramStudi,
	type ProgramStudiPayload,
} from '../sources/remote/study-program.remote-source';

function toEntity(row: BackendProgramStudi): StudyProgramEntity {
	return {
		id: row.id,
		studyProgramName: row.name,
		kode: row.code,
		jenjang: row.level,
		fakultas: row.faculty,
		ketuaProdi: row.programHead,
		peringkatAkreditasi: row.accreditationRank,
		nomorSkAkreditasi: row.accreditationDecreeNumber,
		berlakuSampaiAkreditasi: row.accreditationValidUntil,
		createdAt: row.createdAt,
	};
}

/**
 * `undefined` (bukan `null`) berarti "field ini tidak diikutkan" — backend
 * menolak body dengan properti tak dikenal (`forbidNonWhitelisted`), dan
 * `JSON.stringify` di `api-client.ts` otomatis membuang key bernilai
 * `undefined`, jadi ini juga jalan satu-satunya mengosongkan field opsional.
 */
function toPayload(
	data: Partial<Omit<StudyProgramEntity, 'id' | 'createdAt'>>,
): Partial<ProgramStudiPayload> {
	const payload: Partial<ProgramStudiPayload> = {};
	if (data.studyProgramName !== undefined) payload.name = data.studyProgramName;
	if (data.kode !== undefined) payload.code = data.kode;
	if (data.jenjang !== undefined) payload.level = data.jenjang;
	if (data.fakultas !== undefined) payload.faculty = data.fakultas;
	if (data.ketuaProdi !== undefined) payload.programHead = data.ketuaProdi;
	if (data.peringkatAkreditasi !== undefined)
		payload.accreditationRank = data.peringkatAkreditasi;
	if (data.nomorSkAkreditasi !== undefined)
		payload.accreditationDecreeNumber = data.nomorSkAkreditasi ?? undefined;
	if (data.berlakuSampaiAkreditasi !== undefined)
		payload.accreditationValidUntil = data.berlakuSampaiAkreditasi ?? undefined;
	return payload;
}

export const studyProgramRepository = {
	findAll(): Promise<StudyProgramEntity[]> {
		return studyProgramRemoteSource.findAll().then((rows) => rows.map(toEntity));
	},

	async findById(id: string): Promise<StudyProgramEntity | undefined> {
		try {
			return toEntity(await studyProgramRemoteSource.findById(id));
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) return undefined;
			throw e;
		}
	},

	/**
	 * `id`/`createdAt` dibuat backend, bukan di sini — mengirimnya akan ditolak
	 * `forbidNonWhitelisted`. Cascade ke `user_data`/`led_project_data` yang
	 * dulu ditulis manual di sini sudah tidak ada: itu tanggung jawab FK
	 * database sekarang, bukan yang bisa direplikasi lewat CRUD API ini.
	 */
	async create(
		data: Omit<StudyProgramEntity, 'id' | 'createdAt'>,
	): Promise<StudyProgramEntity> {
		const created = await studyProgramRemoteSource.create(
			toPayload(data) as ProgramStudiPayload,
		);
		window.dispatchEvent(new Event('storage-update'));
		return toEntity(created);
	},

	async delete(id: string): Promise<void> {
		await studyProgramRemoteSource.remove(id);
		window.dispatchEvent(new Event('storage-update'));
	},

	async update(
		id: string,
		data: Partial<Omit<StudyProgramEntity, 'id' | 'createdAt'>>,
	): Promise<StudyProgramEntity> {
		const updated = await studyProgramRemoteSource.update(id, toPayload(data));
		window.dispatchEvent(new Event('storage-update'));
		return toEntity(updated);
	},
};
