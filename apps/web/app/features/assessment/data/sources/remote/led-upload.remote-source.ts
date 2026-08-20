import { apiFetch } from '~/core/lib/api-client';

/**
 * Unggah PDF LED lewat presigned URL R2 (tracker: Cloudflare R2 Storage
 * Module) — browser PUT langsung ke R2, backend tidak pernah memegang isi
 * filenya. `POST dokumen/:id/led-upload` lalu meneruskannya (server-side)
 * ke apps/ai's `/upload/led`, yang mengekstraksi+mengindeks pgvector-nya
 * sendiri, tidak berubah.
 */
export async function uploadLedPdf(file: File, dokumenId: string): Promise<void> {
	const { key, uploadUrl } = await apiFetch<{ key: string; uploadUrl: string }>(
		'/storage/presigned-upload',
		{
			method: 'POST',
			body: { fileName: file.name, contentType: file.type || 'application/pdf' },
		},
	);

	const put = await fetch(uploadUrl, {
		method: 'PUT',
		headers: { 'Content-Type': file.type || 'application/pdf' },
		body: file,
	});
	if (!put.ok) {
		throw new Error(`Unggah ke R2 gagal (${put.status})`);
	}

	await apiFetch(`/dokumen/${dokumenId}/led-upload`, {
		method: 'POST',
		body: { fileKey: key },
	});
}
