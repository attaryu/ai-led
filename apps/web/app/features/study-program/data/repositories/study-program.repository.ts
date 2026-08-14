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
		studyProgramName: row.nama,
		kode: row.kode,
		jenjang: row.jenjang,
		fakultas: row.fakultas,
		ketuaProdi: row.ketuaProdi,
		peringkatAkreditasi: row.peringkatAkreditasi,
		nomorSkAkreditasi: row.nomorSkAkreditasi,
		berlakuSampaiAkreditasi: row.berlakuSampaiAkreditasi,
		createdAt: row.dibuatPada,
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
	if (data.studyProgramName !== undefined) payload.nama = data.studyProgramName;
	if (data.kode !== undefined) payload.kode = data.kode;
	if (data.jenjang !== undefined) payload.jenjang = data.jenjang;
	if (data.fakultas !== undefined) payload.fakultas = data.fakultas;
	if (data.ketuaProdi !== undefined) payload.ketuaProdi = data.ketuaProdi;
	if (data.peringkatAkreditasi !== undefined)
		payload.peringkatAkreditasi = data.peringkatAkreditasi;
	if (data.nomorSkAkreditasi !== undefined)
		payload.nomorSkAkreditasi = data.nomorSkAkreditasi ?? undefined;
	if (data.berlakuSampaiAkreditasi !== undefined)
		payload.berlakuSampaiAkreditasi = data.berlakuSampaiAkreditasi ?? undefined;
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
