import { ApiError, apiFetch } from '~/core/lib/api-client';
import { type RubricCriterion } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import {
	cekSyaratSiap,
	type AccreditationSetEntity,
	type PanduanLibraryItem,
	type SetDocumentType,
} from '../../domain/entities/accreditation-set.entity';
import { type CreateAccreditationSetDto } from '../../domain/dtos/create-accreditation-set.dto';
import { type UpdateAccreditationSetDto } from '../../domain/dtos/update-accreditation-set.dto';
import { type ChapterTemplateEntity } from '../../domain/entities/chapter-template.entity';
import { type StructurePreviewEntity } from '../../domain/entities/structure-preview.entity';
import {
	mapChapterTemplate,
	mapCriterion,
	mapPanduanLibraryItem,
	mapStructurePreview,
	toCriterionPayload,
	toEntity,
	toListEntity,
} from '../backend-mappers';
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
	subNo = '',
): void {
	// ponytail: dulu bentrok bila `no` sama saja. Sejak ada sub-indikator, kuncinya nomor + sub (43.I dan 43.II sah).
	const bentrok = set.kriteria.some(
		(k) => k.no === no && (k.subNo ?? '') === (subNo ?? '') && k.id !== abaikanId,
	);

	if (bentrok) {
		throw new Error(
			`Nomor indikator ${no}${subNo ? ` (sub ${subNo})` : ''} sudah dipakai kriteria lain di set ini.`,
		);
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
		assertNomorBebas(current, input.no, criterionId, input.subNo ?? current.kriteria.find((k) => k.id === criterionId)?.subNo ?? '');

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

	/** Struktur bab/sub-bab resmi set ini, terurut -- kosong kalau belum pernah diekstrak. */
	async findChapterTemplates(setId: string): Promise<ChapterTemplateEntity[]> {
		const rows = await accreditationSetRemoteSource.findChapterTemplates(setId);
		return rows.map(mapChapterTemplate).sort((a, b) => a.urutan - b.urutan);
	},

	/** Pohon staged (MENUNGGU_KONFIRMASI) atau struktur nyata -- modal "Pilih Struktur Pedoman". */
	async previewStructure(setId: string): Promise<StructurePreviewEntity> {
		const row = await accreditationSetRemoteSource.previewStructure(setId);
		return mapStructurePreview(row);
	},

	/** Commit HANYA node yang tercentang; sisanya dibuang permanen. */
	async confirmStructure(setId: string, acceptedIds: string[]): Promise<void> {
		await accreditationSetRemoteSource.confirmStructure(setId, acceptedIds);
	},

	/** gap #2: nyala/matiin 1 sub-bab yang sudah commit dari outline BARU, tanpa re-extract. */
	async toggleSection(subBabId: string, isActive: boolean): Promise<void> {
		await accreditationSetRemoteSource.toggleSection(subBabId, isActive);
	},

	/** Semua Panduan tenant ini -- dropdown "pilih existing". */
	async listPanduan(): Promise<PanduanLibraryItem[]> {
		const rows = await accreditationSetRemoteSource.listPanduan();
		return rows.map(mapPanduanLibraryItem);
	},

	/** Upload Panduan BARU (belum terpasang ke set manapun), lalu langsung pasang ke set ini. */
	async uploadAndAttachPanduan(setId: string, file: File): Promise<AccreditationSetEntity> {
		const { fileKey } = await uploadDocument(file);
		const panduan = await accreditationSetRemoteSource.uploadPanduan({ fileKey, title: file.name });
		await accreditationSetRemoteSource.attachPanduan(setId, panduan.id);
		return getEntity(setId);
	},

	/** Pasang Panduan yang sudah ada (dari listPanduan) ke set ini, tanpa upload/ekstraksi ulang. */
	async attachPanduan(setId: string, panduanId: string): Promise<AccreditationSetEntity> {
		await accreditationSetRemoteSource.attachPanduan(setId, panduanId);
		return getEntity(setId);
	},

	/** Lepas Panduan dari set ini -- baris Panduan-nya sendiri (dan set lain yang memakainya) tidak tersentuh. */
	async detachPanduan(setId: string): Promise<AccreditationSetEntity> {
		const current = await getEntity(setId);
		assertMasihSahSebagaiSiap({ ...current, panduan: null });

		await accreditationSetRemoteSource.detachPanduan(setId);
		return getEntity(setId);
	},

	/** Re-upload KE Panduan yang sudah ada -- wipe+re-extract, mempengaruhi SEMUA set yang menunjuknya. */
	async replacePanduan(panduanId: string, file: File): Promise<void> {
		const { fileKey } = await uploadDocument(file);
		await accreditationSetRemoteSource.replacePanduan(panduanId, { fileKey, title: file.name });
	},

	/** Hapus Panduan yang sudah tidak dipakai Set manapun -- backend menolak (409) kalau masih dipakai. */
	async deletePanduan(panduanId: string): Promise<void> {
		await accreditationSetRemoteSource.deletePanduan(panduanId);
	},
};
