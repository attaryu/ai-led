import { type UploadEvidenceTargetDto } from '../../../domain/dtos/upload-evidence.dto';

/**
 * Tiruan sisi jaringan untuk unggahan bukti dukung.
 *
 * Ini **satu-satunya berkas yang perlu diganti** saat backend siap: bentuk
 * ketiga fungsinya sudah mengikuti alur sebenarnya —
 *
 *   1. minta presigned URL ke backend
 *   2. PUT berkas langsung ke object storage (R2), dengan progres
 *   3. lapor ke backend bahwa objek sudah mendarat, backend mengantrekan ingestion
 *
 * Catatan implementasi nanti: langkah 2 harus memakai `XMLHttpRequest` karena
 * `fetch` belum punya progres unggah yang bisa dibaca.
 */

export type EvidenceUploadTarget = UploadEvidenceTargetDto;

export type PresignedUpload = {
	uploadUrl: string;
	objectKey: string;
};

export type PresignRequest = {
	namaDokumen: string;
	tipeFile: string;
	ukuranBytes: number;
	target: EvidenceUploadTarget;
};

export type ReportUploadRequest = {
	objectKey: string;
	namaDokumen: string;
	tipeFile: string;
	ukuranBytes: number;
	target: EvidenceUploadTarget;
};

/** Bentuk balikan backend setelah unggahan dilaporkan. */
export type ReportUploadResponse = {
	id: string;
	fileUrl: string;
	waktuDiunggah: string;
};

export class EvidenceUploadError extends Error {
	constructor(
		message: string,
		/** Tahap yang gagal, dipakai panel unggah untuk menyusun pesan. */
		readonly phase: 'presign' | 'uploading' | 'reporting',
	) {
		super(message);
		this.name = 'EvidenceUploadError';
	}
}

/**
 * Kegagalan sengaja disuntikkan secara berkala (bukan acak) supaya jalur error
 * dan tombol "coba lagi" benar-benar terlihat saat pengembangan, dan supaya
 * percobaan berikutnya pasti berhasil — bikin demo retry tidak menggantung.
 */
const UPLOAD_FAILURE_EVERY = 7;
const INGESTION_FAILURE_EVERY = 4;

let uploadAttempt = 0;
let ingestionAttempt = 0;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Dipakai repository untuk memutuskan hasil akhir simulasi ingestion. */
export function shouldFailIngestion(): boolean {
	ingestionAttempt += 1;
	return ingestionAttempt % INGESTION_FAILURE_EVERY === 0;
}

export async function requestPresignedUrl(
	request: PresignRequest,
): Promise<PresignedUpload> {
	await delay(400);

	const scope =
		request.target.ownerTipe === 'TENANT'
			? 'tenant'
			: `program-studi/${request.target.studyProgramId}`;
	const objectKey = `${scope}/${Date.now()}-${request.namaDokumen}`;

	return {
		uploadUrl: `https://r2.mock.local/${objectKey}?X-Amz-Signature=mock`,
		objectKey,
	};
}

/**
 * Meniru PUT ke R2. Durasinya ikut ukuran berkas supaya berkas besar terasa
 * lebih lama, seperti unggahan sungguhan.
 */
export function uploadToStorage(
	file: File,
	_uploadUrl: string,
	onProgress: (percent: number) => void,
): Promise<void> {
	uploadAttempt += 1;
	const willFail = uploadAttempt % UPLOAD_FAILURE_EVERY === 0;

	const durationMs = Math.min(
		6000,
		Math.max(1200, (file.size / (2 * 1024 * 1024)) * 1000),
	);
	const tickMs = 120;
	const step = 100 / (durationMs / tickMs);
	// Kegagalan jaringan biasanya terjadi di tengah jalan, bukan di 0%.
	const failAt = 40 + (uploadAttempt % 3) * 10;

	return new Promise((resolve, reject) => {
		let percent = 0;
		const timer = setInterval(() => {
			percent = Math.min(100, percent + step);

			if (willFail && percent >= failAt) {
				clearInterval(timer);
				reject(
					new EvidenceUploadError(
						'Koneksi ke penyimpanan terputus saat mengunggah.',
						'uploading',
					),
				);
				return;
			}

			onProgress(Math.round(percent));

			if (percent >= 100) {
				clearInterval(timer);
				resolve();
			}
		}, tickMs);
	});
}

export async function reportUploadComplete(
	request: ReportUploadRequest,
): Promise<ReportUploadResponse> {
	await delay(300);

	return {
		id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
		fileUrl: request.objectKey,
		waktuDiunggah: new Date().toISOString(),
	};
}
