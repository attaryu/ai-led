import { apiFetch } from '~/core/lib/api-client';
import { mapBuktiDukungToEvidence, type BuktiDukungApiRow } from '../../backend-mappers';
import { type EvidenceEntity } from '../../../domain/entities/evidence.entity';
import { type UploadEvidenceTargetDto } from '../../../domain/dtos/upload-evidence.dto';

/**
 * Unggahan bukti dukung lewat R2 presigned URL (tracker: Cloudflare R2
 * Storage Module) — tiga tahap sungguhan menggantikan `evidence-upload.mock.ts`:
 *
 *   1. POST /storage/presigned-upload — minta URL R2 bertanda tangan
 *   2. PUT langsung ke R2 (XMLHttpRequest, supaya progres unggah bisa dibaca)
 *   3. POST /bukti-dukung — konfirmasi objek sudah mendarat, backend membaca
 *      ulang ukuran/tipe lewat HeadObject sendiri & mengantrekan ingestion
 */
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

function messageOf(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export async function requestPresignedUrl(
	file: File,
): Promise<{ uploadUrl: string; objectKey: string }> {
	try {
		const { key, uploadUrl } = await apiFetch<{ key: string; uploadUrl: string }>(
			'/storage/presigned-upload',
			{
				method: 'POST',
				body: {
					fileName: file.name,
					contentType: file.type || 'application/octet-stream',
				},
			},
		);
		return { uploadUrl, objectKey: key };
	} catch (error) {
		throw new EvidenceUploadError(messageOf(error, 'Gagal meminta izin unggah.'), 'presign');
	}
}

/** `fetch` belum punya progres unggah yang bisa dibaca — wajib `XMLHttpRequest`. */
export function uploadToStorage(
	file: File,
	uploadUrl: string,
	onProgress: (percent: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', uploadUrl);
		xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				onProgress(Math.round((event.loaded / event.total) * 100));
			}
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve();
			} else {
				reject(
					new EvidenceUploadError(`Unggah ke penyimpanan gagal (${xhr.status}).`, 'uploading'),
				);
			}
		};
		xhr.onerror = () => {
			reject(
				new EvidenceUploadError('Koneksi ke penyimpanan terputus saat mengunggah.', 'uploading'),
			);
		};

		xhr.send(file);
	});
}

export async function reportUploadComplete({
	objectKey,
	namaDokumen,
	target,
}: {
	objectKey: string;
	namaDokumen: string;
	target: UploadEvidenceTargetDto;
}): Promise<EvidenceEntity> {
	try {
		const row = await apiFetch<BuktiDukungApiRow>('/bukti-dukung', {
			method: 'POST',
			body: {
				ownerType: target.ownerTipe,
				studyProgramId: target.ownerTipe === 'PROGRAM_STUDI' ? target.studyProgramId : undefined,
				documentName: namaDokumen,
				fileKey: objectKey,
			},
		});
		return mapBuktiDukungToEvidence(row);
	} catch (error) {
		throw new EvidenceUploadError(messageOf(error, 'Gagal mencatat berkas di server.'), 'reporting');
	}
}
