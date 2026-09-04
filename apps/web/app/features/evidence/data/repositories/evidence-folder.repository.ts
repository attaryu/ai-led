import {
	type EvidenceFolderEntity,
	type EvidenceScope,
} from '../../domain/entities/evidence-folder.entity';
import { evidenceFolderRemoteSource } from '../sources/remote/evidence-folder.remote-source';

/** Event yang sama dengan fitur lain supaya polanya seragam. */
function notify(): void {
	window.dispatchEvent(new Event('storage-update'));
}

/**
 * Perpustakaan folder bukti dukung — sekarang backend NestJS sungguhan
 * (`apps/backend/src/evidence-folder/`), bukan localStorage. Bentuk API-nya
 * (per-cakupan, bukan satu `findAll()` global) mengikuti `evidenceRepository`:
 * backend tidak pernah mengembalikan folder lintas tenant/prodi sekaligus,
 * jadi pemanggil yang butuh lebih dari satu cakupan (mis.
 * `use-chapter-generation.ts`) memanggil `findByScope` beberapa kali sendiri
 * — pola yang sama dengan `evidenceRepository.findAvailableForStudyProgram`.
 *
 * `findAll()`, `findById()`, `assignedFolderId()`, `evidenceIdsInFolders()`,
 * dan `clearAssignments()` dari versi localStorage tidak ikut: tiga yang
 * terakhir adalah workaround peta lokal untuk `evidence.folderId` yang dulu
 * selalu `null` dari backend — sekarang kolom itu sungguhan, jadi tidak ada
 * lagi peta yang perlu dijaga. `findAll()`/`findById()` tidak dipanggil di
 * mana pun di luar berkas ini (diperiksa lewat grep sebelum dihapus).
 */
export const evidenceFolderRepository = {
	async findByScope(cakupan: EvidenceScope): Promise<EvidenceFolderEntity[]> {
		return evidenceFolderRemoteSource.findByScope(cakupan.ownerTipe, cakupan.studyProgramId);
	},

	async create(input: {
		cakupan: EvidenceScope;
		nama: string;
		parentId: string | null;
		pembuat: { userId: string; nama: string };
	}): Promise<EvidenceFolderEntity> {
		const folder = await evidenceFolderRemoteSource.create({
			ownerType: input.cakupan.ownerTipe,
			studyProgramId: input.cakupan.studyProgramId,
			name: input.nama,
			parentId: input.parentId,
		});
		notify();
		return folder;
	},

	async rename(id: string, nama: string): Promise<void> {
		await evidenceFolderRemoteSource.rename(id, nama.trim());
		notify();
	},

	/**
	 * Memindahkan satu folder. `false` bila tujuannya folder itu sendiri atau
	 * salah satu keturunannya — ditegakkan backend
	 * (`evidence-folder.service.ts::move`), bukan dihitung ulang di sini. Pemilih
	 * di UI sudah menyembunyikan cabang itu (lapis pertama); ini lapis kedua.
	 */
	async moveFolder(id: string, tujuanId: string | null): Promise<boolean> {
		try {
			await evidenceFolderRemoteSource.move(id, tujuanId);
			notify();
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Membuang baris folder tanpa menyentuh berkas di dalamnya.
	 *
	 * Sengaja tidak bernama `delete`: yang memanggilnya adalah hapus berantai di
	 * `evidence.repository.ts`, yang sudah membuang berkasnya lebih dulu.
	 */
	async removeMany(ids: Set<string>): Promise<void> {
		await evidenceFolderRemoteSource.removeMany([...ids]);
		notify();
	},

	/**
	 * Menelusuri — dan membuat yang belum ada — beberapa jalur folder sekaligus,
	 * mengembalikan peta `segments.join('/')` → id folder terdalam. Batch
	 * upsert-nya sendiri (baca sekali, tulis sekali, hindari folder kembar dari
	 * dua unggahan beririsan) sekarang jadi satu transaksi di backend
	 * (`evidence-folder.service.ts::ensurePaths`) — di sini cuma pemanggilnya.
	 */
	async ensureFolderPaths(input: {
		cakupan: EvidenceScope;
		parentId: string | null;
		daftarJalur: string[][];
		pembuat: { userId: string; nama: string };
	}): Promise<Map<string, string | null>> {
		if (input.daftarJalur.length === 0) return new Map();

		const hasil = await evidenceFolderRemoteSource.ensureFolderPaths({
			ownerType: input.cakupan.ownerTipe,
			studyProgramId: input.cakupan.studyProgramId,
			parentId: input.parentId,
			paths: input.daftarJalur,
		});
		notify();
		return new Map(Object.entries(hasil));
	},

	/** Memindahkan sekumpulan berkas ke satu folder sekaligus (`null` = akar). */
	async assignMany(ids: Set<string>, folderId: string | null): Promise<void> {
		await evidenceFolderRemoteSource.assignMany([...ids], folderId);
		notify();
	},
};
