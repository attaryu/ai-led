import { type EvidenceEntity, type EvidenceStatus } from '../../domain/entities/evidence.entity';
import { type EvidencePage, type EvidenceQueryDto } from '../../domain/dtos/evidence-query.dto';
import { type UploadEvidenceTargetDto } from '../../domain/dtos/upload-evidence.dto';
import { evidenceRemoteSource } from '../sources/remote/evidence.remote-source';
import {
	folderAnak,
	hitungIsiFolder,
	jalurFolder,
	keturunanIds,
	type EvidenceNode,
	type EvidenceScope,
} from '../../domain/entities/evidence-folder.entity';
import { evidenceFolderRepository } from './evidence-folder.repository';
import {
	reportUploadComplete,
	requestPresignedUrl,
	uploadToStorage,
} from '../sources/remote/evidence-upload.remote-source';

/** Tenant tunggal selama autentikasi belum terhubung ke backend. */
const CURRENT_TENANT_ID = '1';

/** Nilai urut yang dipakai kolom `status` supaya urutannya bermakna, bukan A-Z. */
const statusOrder: Record<EvidenceStatus, number> = {
	MENUNGGU: 0,
	DIPROSES: 1,
	SIAP: 2,
	GAGAL: 3,
};

function compare(a: EvidenceEntity, b: EvidenceEntity, sort: string): number {
	switch (sort) {
		case 'ukuranBytes':
			return a.ukuranBytes - b.ukuranBytes;
		case 'status':
			return statusOrder[a.status] - statusOrder[b.status];
		case 'waktuDiunggah':
			return a.waktuDiunggah.localeCompare(b.waktuDiunggah);
		case 'tipeFile':
			return a.tipeFile.localeCompare(b.tipeFile);
		case 'uploadedByName':
			return a.uploadedByName.localeCompare(b.uploadedByName);
		case 'studyProgramName':
			return (a.studyProgramName ?? '').localeCompare(b.studyProgramName ?? '');
		default:
			return a.namaDokumen.localeCompare(b.namaDokumen, 'id');
	}
}

/**
 * Backend memproses ekstraksi (INGESTION_BUKTI_DUKUNG) lewat job worker async,
 * tanpa mendorong kabar ke klien — belum ada event SSE untuk job ini seperti
 * yang sudah dipakai GENERASI_BAB/ASSESSMENT_AMI. Sebagai gantinya, tiap
 * unggahan berhasil memicu polling `storage-update` singkat supaya daftar yang
 * sedang terpasang (Perpustakaan, tab Generasi, tab Rujukan) menyegarkan diri
 * sendiri saat MENUNGGU/DIPROSES berubah jadi SIAP/GAGAL.
 *
 * ponytail: polling buta, bukan SSE — upgrade ke job.updateProgress()/event
 * 'progress' (job-events.service.ts) kalau MINERU_TIMEOUT_SECONDS dinaikkan lagi.
 */
const POLL_INTERVAL_MS = 4000;
/** MINERU_TIMEOUT_SECONDS (apps/ai/.env) + buffer — lihat ponytail note di atas. */
const POLL_DURATION_MS = 960_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function notify(): void {
	window.dispatchEvent(new Event('storage-update'));
}

function pollForIngestion(): void {
	if (pollTimer) return;
	const stopAt = Date.now() + POLL_DURATION_MS;
	pollTimer = setInterval(() => {
		if (Date.now() >= stopAt) {
			if (pollTimer) clearInterval(pollTimer);
			pollTimer = null;
			return;
		}
		notify();
	}, POLL_INTERVAL_MS);
}

/**
 * Cakupan perpustakaan dari apa yang dipegang lapis presentasi (`level` +
 * `:programId` di URL).
 *
 * Diekspor karena bukan cuma `findPaged` yang membutuhkannya: membuat folder,
 * memindahkan berkas, dan menelusuri jalur folder saat unggah semuanya bekerja
 * per cakupan. Menyusunnya di tiap pemanggil berarti `CURRENT_TENANT_ID` bocor
 * ke lapis presentasi, dan satu tempat yang lupa mengisinya berarti kebocoran
 * antar prodi.
 */
export function evidenceScopeFor(input: {
	ownerTipe: EvidenceEntity['ownerTipe'];
	studyProgramId?: string | null;
}): EvidenceScope {
	return input.ownerTipe === 'TENANT'
		? {
				ownerTipe: 'TENANT',
				tenantId: CURRENT_TENANT_ID,
				studyProgramId: null,
			}
		: {
				ownerTipe: 'PROGRAM_STUDI',
				tenantId: null,
				studyProgramId: input.studyProgramId ?? null,
			};
}

export const evidenceRepository = {
	/**
	 * Penyaringan, pencarian, pengurutan, dan pemotongan halaman semuanya di
	 * sini — bukan di halaman — walau sumbernya sekarang jaringan, bukan
	 * localStorage: kolomnya (`namaDokumen`, `uploadedByName`, dst.) tidak
	 * dipahami query backend, cuma cakupan (`ownerTipe`/`studyProgramId`) yang
	 * sudah difilter server (lihat `bukti-dukung.service.ts::findAll`).
	 *
	 * **Dua mode, dipisah `q`** (docs/application_flow.md §4.6a):
	 *
	 * - `q` kosong → menjelajah satu folder: subfolder langsung `query.folderId`
	 *   ditambah berkas yang `folderId`-nya sama
	 * - `q` terisi → **seluruh cakupan, folder diabaikan**, dan tiap berkas
	 *   dibawakan jalur foldernya
	 *
	 * **Folder selalu di depan berkas**, apa pun kunci dan arah urutannya, dan
	 * antar folder selalu menurut nama. Halaman memotong daftar gabungan itu,
	 * jadi `PaginationFooter` tidak perlu tahu ada dua macam baris.
	 */
	async findPaged(query: EvidenceQueryDto): Promise<EvidencePage> {
		const cakupan = evidenceScopeFor(query);
		const berkasCakupan = await evidenceRemoteSource.findAll({
			ownerTipe: query.ownerTipe,
			studyProgramId: query.studyProgramId,
		});
		const folderCakupan = await evidenceFolderRepository.findByScope(cakupan);

		const keyword = query.q?.trim().toLowerCase() ?? '';
		const mencari = keyword !== '';
		const folderAktif = query.folderId ?? null;

		// Dihitung atas seluruh cakupan, bukan atas yang tampil: angka di kartu
		// folder memang harus mencakup keturunan yang tidak sedang dirender.
		const isi = hitungIsiFolder(folderCakupan, berkasCakupan);

		const folderTampil = mencari
			? folderCakupan
					.filter((folder) => folder.nama.toLowerCase().includes(keyword))
					.sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
			: folderAnak(folderCakupan, folderAktif);

		const nodeFolder = folderTampil.map<EvidenceNode>((folder) => ({
			tipe: 'FOLDER',
			id: folder.id,
			folder,
			jumlahBerkas: isi.get(folder.id)?.berkas ?? 0,
			jumlahPerluPerhatian: isi.get(folder.id)?.perluPerhatian ?? 0,
		}));

		const berkasTampil = mencari
			? berkasCakupan.filter(
					(evidence) =>
						evidence.namaDokumen.toLowerCase().includes(keyword) ||
						evidence.uploadedByName.toLowerCase().includes(keyword) ||
						evidence.tipeFile.toLowerCase().includes(keyword),
				)
			: berkasCakupan.filter((evidence) => evidence.folderId === folderAktif);

		// Tanpa pilihan urutan, yang terbaru di atas — kebiasaan umum daftar berkas.
		const sortKey = query.sort ?? 'waktuDiunggah';
		const descending = query.sort ? query.dir === 'desc' : true;
		const berkasUrut = [...berkasTampil].sort((a, b) => {
			const result = compare(a, b, sortKey);
			return descending ? -result : result;
		});

		// Dikunci per folder, bukan per berkas: jumlah foldernya belasan sementara
		// berkasnya bisa ratusan, dan jalur keduanya sama.
		const jalurPerFolder = new Map<string, string[]>();
		if (mencari) {
			for (const folder of folderCakupan) {
				jalurPerFolder.set(
					folder.id,
					jalurFolder(folderCakupan, folder.id).map((simpul) => simpul.nama),
				);
			}
		}

		const nodeBerkas = berkasUrut.map<EvidenceNode>((evidence) => ({
			tipe: 'BERKAS',
			id: evidence.id,
			evidence,
			jalur:
				mencari && evidence.folderId !== null
					? (jalurPerFolder.get(evidence.folderId) ?? [])
					: [],
		}));

		const gabungan = [...nodeFolder, ...nodeBerkas];
		const start = (query.page - 1) * query.limit;
		return {
			items: gabungan.slice(start, start + query.limit),
			total: gabungan.length,
		};
	},

	/** Bukti dukung level TENANT saja — dipakai Dashboard Utama (§4.0). */
	async findAllTenant(): Promise<EvidenceEntity[]> {
		return evidenceRemoteSource.findAll({ ownerTipe: 'TENANT' });
	},

	/**
	 * Seluruh bukti dukung yang bisa dipakai satu prodi: miliknya sendiri
	 * ditambah bukti level tenant yang berlaku lintas prodi
	 * (docs/application_flow.md §5.2).
	 *
	 * GET /bukti-dukung tanpa `programStudiId` (bagian tenant) ditolak 403 oleh
	 * backend untuk role PENYUSUN (docs/database.md §7 — perpustakaan level
	 * universitas cuma Pimpinan/Penjamin Mutu). Temuan kendala, dicatat bukan
	 * disembunyikan: Penyusun yang menyusun bab jadi tidak melihat bukti dukung
	 * tenant sebagai konteks generate, padahal §5.2 bilang seharusnya ikut
	 * tersedia. Bagian prodi tetap muncul; bagian tenant jatuh ke larik kosong.
	 */
	async findAvailableForStudyProgram(studyProgramId: string): Promise<EvidenceEntity[]> {
		const [tenant, prodi] = await Promise.all([
			evidenceRemoteSource.findAll({ ownerTipe: 'TENANT' }).catch(() => []),
			evidenceRemoteSource.findAll({ ownerTipe: 'PROGRAM_STUDI', studyProgramId }),
		]);
		return [...tenant, ...prodi].sort((a, b) =>
			b.waktuDiunggah.localeCompare(a.waktuDiunggah),
		);
	},

	/**
	 * Bukti dukung **milik** satu prodi saja, tanpa berkas level tenant.
	 *
	 * Sengaja dipisah dari {@link findAvailableForStudyProgram}: yang ini
	 * menjawab "apa isi perpustakaan prodi ini" sehingga angkanya cocok dengan
	 * daftar di `/study-programs/:id/evidence` (§5.2), sedangkan yang satunya
	 * menjawab "apa yang boleh dipakai babnya" dan wajar ikut menghitung berkas
	 * universitas.
	 */
	async findOwnedByStudyProgram(studyProgramId: string): Promise<EvidenceEntity[]> {
		return evidenceRemoteSource.findAll({ ownerTipe: 'PROGRAM_STUDI', studyProgramId });
	},

	async delete(id: string): Promise<void> {
		await evidenceRemoteSource.remove(id);
		notify();
	},

	/** Memindahkan sekumpulan berkas ke satu folder (`null` = akar cakupannya). */
	async moveMany(ids: Set<string>, folderId: string | null): Promise<void> {
		await evidenceFolderRepository.assignMany(ids, folderId);
	},

	/**
	 * Apa yang akan ikut terhapus bersama sebuah folder. Murni membaca — dipakai
	 * menyusun kalimat konfirmasi sebelum ada yang dihapus.
	 *
	 * `subfolder` tidak menghitung folder itu sendiri, supaya angkanya bisa
	 * langsung dibacakan apa adanya di konfirmasi. `berkas` dihitung dari
	 * `evidence.folderId` sungguhan sekarang — bukan peta lokal lagi.
	 */
	async rincianHapusFolder(
		cakupan: EvidenceScope,
		folderId: string,
	): Promise<{ subfolder: number; berkas: number }> {
		const [folders, evidences] = await Promise.all([
			evidenceFolderRepository.findByScope(cakupan),
			evidenceRemoteSource.findAll({ ownerTipe: cakupan.ownerTipe, studyProgramId: cakupan.studyProgramId }),
		]);
		const ids = keturunanIds(folders, folderId);
		const berkas = evidences.filter((evidence) => evidence.folderId !== null && ids.has(evidence.folderId)).length;
		return { subfolder: ids.size - 1, berkas };
	},

	/**
	 * Menghapus folder beserta seluruh keturunannya — subfolder maupun berkas
	 * yang `folderId`-nya menunjuk salah satunya.
	 *
	 * Berkas dihapus lewat backend sungguhan (`evidenceRemoteSource.remove`),
	 * satu per satu — bukan cuma dilepas dari foldernya. Kegagalan satu berkas
	 * (mis. bukan milik pengunggah yang sedang login — lihat aturan akses di
	 * `bukti-dukung.controller.ts`) tidak membatalkan sisanya: dipindah ke folder
	 * induk supaya tetap terlihat (bukan menunjuk folder yang sebentar lagi
	 * lenyap), lalu error dilempar supaya pemanggil tahu foldernya tidak
	 * bersih-bersih sepenuhnya.
	 */
	async deleteFolderCascade(cakupan: EvidenceScope, folderId: string): Promise<void> {
		const [folders, evidences] = await Promise.all([
			evidenceFolderRepository.findByScope(cakupan),
			evidenceRemoteSource.findAll({ ownerTipe: cakupan.ownerTipe, studyProgramId: cakupan.studyProgramId }),
		]);
		const target = folders.find((folder) => folder.id === folderId);
		const ids = keturunanIds(folders, folderId);
		const evidenceIds = evidences
			.filter((evidence) => evidence.folderId !== null && ids.has(evidence.folderId))
			.map((evidence) => evidence.id);

		const gagal = new Set<string>();
		await Promise.all(
			evidenceIds.map((id) =>
				evidenceRemoteSource.remove(id).catch(() => {
					gagal.add(id);
				}),
			),
		);

		if (gagal.size > 0) {
			await evidenceFolderRepository.assignMany(gagal, target?.parentId ?? null);
		}
		await evidenceFolderRepository.removeMany(ids);
		notify();

		if (gagal.size > 0) {
			throw new Error(
				`Folder terhapus, tapi ${gagal.size} berkas di dalamnya gagal dihapus (mungkin bukan milik Anda) — dipindahkan ke folder induk.`,
			);
		}
	},

	/** Mengembalikan baris GAGAL ke MENUNGGU dan memicu ulang job ekstraksinya di backend. */
	async retryIngestion(id: string): Promise<void> {
		await evidenceRemoteSource.retry(id);
		notify();
		pollForIngestion();
	},

	/**
	 * Satu berkas, dari minta presigned URL sampai barisnya tercatat lewat
	 * `POST /bukti-dukung`. Melempar `EvidenceUploadError` bila gagal di
	 * tengah — pemanggil (store unggah) yang menampilkan dan menyediakan coba
	 * lagi.
	 *
	 * `uploadedByUserId`/`uploadedByName`/`studyProgramName` tidak lagi dipakai
	 * di sini — backend menurunkan pengunggah dari JWT (`diunggahOlehUserId`
	 * di `bukti-dukung.service.ts`), bukan dari body request. Parameternya
	 * dipertahankan supaya `evidence-upload.store.ts` tidak perlu diubah.
	 */
	async upload({
		file,
		target,
		folderId,
		indicatorNos,
		accreditationSetId,
		onProgress,
	}: {
		file: File;
		target: UploadEvidenceTargetDto;
		uploadedByUserId: string;
		uploadedByName: string;
		studyProgramName: string | null;
		/**
		 * Folder tujuan; `null` = akar cakupannya.
		 *
		 * **Per berkas, bukan per batch** — tidak seperti `target`. Satu unggahan
		 * folder membawa berkas dari beberapa folder sekaligus, sementara cakupannya
		 * tetap satu. Jalurnya sudah diselesaikan pemanggil lewat
		 * `evidenceFolderRepository.ensureFolderPaths` sebelum batch dimulai.
		 */
		folderId: string | null;
		/** Nomor indikator AMI yang ditandai untuk berkas ini; berlaku satu batch — lihat `evidence-upload-dialog.tsx`. */
		indicatorNos?: number[];
		/** Set Akreditasi yang jadi acuan `indicatorNos` — wajib bareng `indicatorNos`. */
		accreditationSetId?: string;
		onProgress: (percent: number) => void;
	}): Promise<EvidenceEntity> {
		const { uploadUrl, objectKey } = await requestPresignedUrl(file);
		await uploadToStorage(file, uploadUrl, onProgress);
		const evidence = await reportUploadComplete({
			objectKey,
			namaDokumen: file.name,
			target,
			folderId,
			indicatorNos,
			accreditationSetId,
		});

		notify();
		pollForIngestion();

		return evidence;
	},
};
