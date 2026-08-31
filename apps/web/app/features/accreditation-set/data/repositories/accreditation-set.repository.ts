import { ApiError, apiFetch } from '~/core/lib/api-client';
import { type RubricCriterion } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import {
	cekSyaratSiap,
	type AccreditationSetEntity,
	type SetDocumentType,
} from '../../domain/entities/accreditation-set.entity';
import { type CreateAccreditationSetDto } from '../../domain/dtos/create-accreditation-set.dto';
import { type UpdateAccreditationSetDto } from '../../domain/dtos/update-accreditation-set.dto';
import { mapCriterion, toCriterionPayload, toEntity, toListEntity } from '../backend-mappers';
import {
	accreditationSetRemoteSource,
	type BackendDocumentType,
} from '../sources/remote/accreditation-set.remote-source';

/** Satu kriteria tanpa `id` -- bentuk yang datang dari formulir. */
export type CriterionInput = Omit<RubricCriterion, 'id'>;

/**
 * Menolak perubahan yang membuat set berstatus `SIAP` tidak lagi memenuhi
 * syaratnya.
 *
 * Backend tidak menegakkan ini (lihat accreditation-set.service.ts::
 * removeCriterion, tidak ada pengecekan readiness) -- satu-satunya penjaga
 * saat ini ada di sini. Set siap sengaja tidak dikunci -- yang mengunci
 * adalah pemakaian -- tapi "tidak dikunci" bukan berarti boleh dikosongkan.
 * Draf tidak tersentuh aturan ini: ia memang sedang disusun.
 */
function assertMasihSahSebagaiSiap(set: AccreditationSetEntity): void {
	if (set.status !== 'SIAP') return;

	const halangan = cekSyaratSiap(set);
	if (halangan) throw new Error(halangan);
}

/** `abaikanId` menjaga kriteria yang sedang dikoreksi tidak bentrok dengan dirinya sendiri. */
function assertNomorBebas(
	set: AccreditationSetEntity,
	no: number,
	abaikanId: string,
): void {
	const bentrok = set.kriteria.some((k) => k.no === no && k.id !== abaikanId);

	if (bentrok) {
		throw new Error(`Nomor indikator ${no} sudah dipakai kriteria lain di set ini.`);
	}
}

async function getEntity(id: string): Promise<AccreditationSetEntity> {
	const row = await accreditationSetRemoteSource.findById(id);
	return toEntity(row);
}

async function uploadDocument(file: File): Promise<{ fileKey: string }> {
	const { key, uploadUrl } = await apiFetch<{ key: string; uploadUrl: string }>(
		'/storage/presigned-upload',
		{
			method: 'POST',
			body: { fileName: file.name, contentType: file.type || 'application/octet-stream' },
		},
	);

	const put = await fetch(uploadUrl, {
		method: 'PUT',
		headers: { 'Content-Type': file.type || 'application/octet-stream' },
		body: file,
	});
	if (!put.ok) {
		throw new Error(`Unggah ke penyimpanan gagal (${put.status}).`);
	}

	return { fileKey: key };
}

/**
 * Satu-satunya titik yang tahu dari mana data set berasal -- kini
 * `apps/backend/src/accreditation-set` (NestJS + Prisma), menggantikan
 * localStorage. Bentuk yang dikembalikan tiap method tetap sama seperti
 * sebelumnya supaya halaman pemanggil tidak perlu berubah.
 */
export const accreditationSetRepository = {
	async findAll(): Promise<AccreditationSetEntity[]> {
		const rows = await accreditationSetRemoteSource.findAll();
		return rows.map(toListEntity);
	},

	async findById(id: string): Promise<AccreditationSetEntity | undefined> {
		try {
			return await getEntity(id);
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) return undefined;
			throw e;
		}
	},

	/**
	 * Set yang boleh dipilih sebuah Dokumen LED -- hanya yang berstatus `SIAP`.
	 *
	 * Draf sengaja tidak ikut: isinya masih bisa berubah, dan dokumen yang
	 * terlanjur memilihnya akan mendapati rubriknya bergeser di tengah
	 * penyusunan. Penyaringan ditaruh di repository, bukan di daftar pilihan,
	 * supaya aturannya tetap berlaku dari mana pun pilihan itu dibuka.
	 */
	async findSelectable(): Promise<AccreditationSetEntity[]> {
		const sets = await this.findAll();
		return sets.filter((set) => set.status === 'SIAP');
	},

	async create(input: CreateAccreditationSetDto): Promise<AccreditationSetEntity> {
		const row = await accreditationSetRemoteSource.create(input);
		return toEntity(row);
	},

	async update(
		id: string,
		input: UpdateAccreditationSetDto,
	): Promise<AccreditationSetEntity> {
		const row = await accreditationSetRemoteSource.update(id, input);
		return toEntity(row);
	},

	/**
	 * Menghapus set. Backend menolak (409) bila masih ada Dokumen LED yang
	 * menunjuk ke sini -- pesannya sudah dalam Bahasa Indonesia yang sama
	 * persis dengan yang dulu dilempar di sini, jadi diteruskan apa adanya.
	 */
	async delete(id: string): Promise<void> {
		await accreditationSetRemoteSource.remove(id);
	},

	/** Berapa Dokumen LED yang memakai set ini. */
	async countUsage(setId: string): Promise<number> {
		const row = await accreditationSetRemoteSource.findById(setId);
		return row.dipakaiProyek;
	},

	/**
	 * Mengisi satu slot berkas: unggah ke R2 lewat presigned URL, lalu catat
	 * di server. Slot yang sudah terisi langsung ditimpa (attachDocument
	 * backend meng-upsert per `type`).
	 */
	async attachDocument(
		id: string,
		tipe: SetDocumentType,
		file: File,
		_diunggahOleh: string,
	): Promise<AccreditationSetEntity> {
		const { fileKey } = await uploadDocument(file);
		await accreditationSetRemoteSource.attachDocument(id, tipe as BackendDocumentType, {
			fileKey,
			title: file.name,
		});
		return getEntity(id);
	},

	async removeDocument(
		id: string,
		tipe: SetDocumentType,
	): Promise<AccreditationSetEntity> {
		const current = await getEntity(id);
		const simulated: AccreditationSetEntity = {
			...current,
			dokumen: current.dokumen.filter((d) => d.tipe !== tipe),
		};
		assertMasihSahSebagaiSiap(simulated);

		await accreditationSetRemoteSource.removeDocument(id, tipe as BackendDocumentType);
		return getEntity(id);
	},

	/**
	 * Membetulkan satu kriteria yang sudah ada.
	 *
	 * Backend tidak punya endpoint "ubah satu kriteria" -- kontraknya
	 * `POST .../criteria/replace-all` (lihat replace-criteria.dto.ts), jadi
	 * baris ini menyusun ulang SELURUH daftar kriteria set (yang lain apa
	 * adanya, targetnya diganti) lalu mengirim semuanya sekaligus.
	 *
	 * Nomor indikator tetap harus unik dalam satu set: ia dipakai sebagai kunci
	 * hasil penilaian (`IndicatorResult.indicatorNo`), jadi nomor kembar membuat
	 * dua baris hasil saling menimpa tanpa satu pun pesan.
	 */
	async updateCriterion(
		setId: string,
		criterionId: string,
		input: CriterionInput,
	): Promise<AccreditationSetEntity> {
		const current = await getEntity(setId);
		assertNomorBebas(current, input.no, criterionId);

		if (!current.kriteria.some((k) => k.id === criterionId)) {
			throw new Error('Kriteria tidak ditemukan');
		}

		const payload = current.kriteria.map((k) =>
			k.id === criterionId ? toCriterionPayload(input) : toCriterionPayload(k),
		);
		const row = await accreditationSetRemoteSource.replaceCriteria(setId, payload);
		return { ...current, kriteria: row.criteria.map(mapCriterion) };
	},

	/**
	 * Menghapus satu kriteria lewat `DELETE .../criteria/:criterionId`.
	 * Divalidasi dulu terhadap syarat siap (lihat `assertMasihSahSebagaiSiap`)
	 * karena backend belum menegakkannya sendiri.
	 */
	async removeCriterion(
		setId: string,
		criterionId: string,
	): Promise<AccreditationSetEntity> {
		const current = await getEntity(setId);
		const simulated: AccreditationSetEntity = {
			...current,
			kriteria: current.kriteria.filter((k) => k.id !== criterionId),
		};
		assertMasihSahSebagaiSiap(simulated);

		await accreditationSetRemoteSource.removeCriterion(setId, criterionId);
		return getEntity(setId);
	},

	/**
	 * Menandai set siap dipakai. Syarat kelengkapan (§ `cekSyaratSiap`) sudah
	 * ditegakkan ulang di server (accreditation-set.service.ts::markReady)
	 * dengan pesan yang sama, jadi tidak diulang di sini.
	 */
	async markReady(setId: string): Promise<AccreditationSetEntity> {
		const row = await accreditationSetRemoteSource.markReady(setId);
		return toEntity(row);
	},

	/**
	 * Menyalin set jadi draf baru -- penamaan salinan unik ("(salinan)", lalu
	 * bernomor) sudah dikerjakan server (accreditation-set.service.ts::duplicate).
	 */
	async duplicate(setId: string): Promise<AccreditationSetEntity> {
		const row = await accreditationSetRemoteSource.duplicate(setId);
		return toEntity(row);
	},
};
