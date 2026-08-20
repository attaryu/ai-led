import { type EvidenceEntity, type EvidenceStatus } from '../../domain/entities/evidence.entity';
import { type EvidencePage, type EvidenceQueryDto } from '../../domain/dtos/evidence-query.dto';
import { type UploadEvidenceTargetDto } from '../../domain/dtos/upload-evidence.dto';
import { evidenceRemoteSource } from '../sources/remote/evidence.remote-source';
import {
	reportUploadComplete,
	requestPresignedUrl,
	uploadToStorage,
} from '../sources/remote/evidence-upload.remote-source';

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
 * ponytail: polling buta 90 detik lalu berhenti sendiri, bukan SSE — upgrade
 * ke job.updateProgress()/event 'progress' (job-events.service.ts) kalau
 * ekstraksi rutin makan waktu lebih lama dari itu di produksi.
 */
const POLL_INTERVAL_MS = 4000;
const POLL_DURATION_MS = 90_000;
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

export const evidenceRepository = {
	/**
	 * Penyaringan, pencarian, pengurutan, dan pemotongan halaman semuanya di
	 * sini — bukan di halaman — walau sumbernya sekarang jaringan, bukan
	 * localStorage: kolomnya (`namaDokumen`, `uploadedByName`, dst.) tidak
	 * dipahami query backend, cuma cakupan (`ownerTipe`/`studyProgramId`) yang
	 * sudah difilter server (lihat `bukti-dukung.service.ts::findAll`).
	 */
	async findPaged(query: EvidenceQueryDto): Promise<EvidencePage> {
		const scoped = await evidenceRemoteSource.findAll({
			ownerTipe: query.ownerTipe,
			studyProgramId: query.studyProgramId,
		});

		const keyword = query.q?.trim().toLowerCase() ?? '';
		const filtered = keyword
			? scoped.filter(
					(evidence) =>
						evidence.namaDokumen.toLowerCase().includes(keyword) ||
						evidence.uploadedByName.toLowerCase().includes(keyword) ||
						evidence.tipeFile.toLowerCase().includes(keyword),
				)
			: scoped;

		// Tanpa pilihan urutan, yang terbaru di atas — kebiasaan umum daftar berkas.
		const sortKey = query.sort ?? 'waktuDiunggah';
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

	/**
	 * Tidak ada endpoint backend untuk memicu ulang ekstraksi satu baris
	 * (`bukti-dukung.controller.ts` cuma POST/GET/DELETE) — jujur menolak,
	 * bukan berpura-pura berhasil seperti simulasi timer sebelumnya. Satu-
	 * satunya jalan sekarang: hapus baris yang gagal, unggah ulang berkasnya.
	 */
	async retryIngestion(_id: string): Promise<never> {
		throw new Error(
			'Coba proses ulang belum tersedia di backend. Hapus berkas ini lalu unggah ulang.',
		);
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
		onProgress,
	}: {
		file: File;
		target: UploadEvidenceTargetDto;
		uploadedByUserId: string;
		uploadedByName: string;
		studyProgramName: string | null;
		onProgress: (percent: number) => void;
	}): Promise<EvidenceEntity> {
		const { uploadUrl, objectKey } = await requestPresignedUrl(file);
		await uploadToStorage(file, uploadUrl, onProgress);
		const evidence = await reportUploadComplete({
			objectKey,
			namaDokumen: file.name,
			target,
		});

		notify();
		pollForIngestion();

		return evidence;
	},
};
