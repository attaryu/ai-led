/**
 * Job async (REKOMENDASI_DOKUMEN, GENERASI_BAB, ...) dipicu lewat POST, lalu
 * ditunggu selesainya lewat SSE (`streamSse('/jobs/:id/events')`, lihat
 * sse-client.ts) di dalam scope hook React yang memicunya. Selama ini "sedang
 * berjalan" itu cuma state React biasa - refresh di tengah proses membuang
 * state itu tanpa jejak, padahal job-nya sendiri di BullMQ/worker tetap
 * jalan terus. Penyusun kehilangan progres yang sebenarnya masih ada.
 *
 * `jobs.gateway.ts::events` sudah didesain buat nyambung ulang:
 * `startWith(initial)` mengirim status TERKINI job dari DB begitu stream
 * dibuka, entah job itu masih jalan atau sudah selesai - jadi yang kurang
 * cuma sisi sini mengingat job id-nya lewat refresh. `sessionStorage`, bukan
 * `localStorage`: job yang sudah lama beres di tab yang sudah ditutup tidak
 * perlu terus diingat selamanya.
 */

function kunci(chapterId: string, jenis: string): string {
	return `pending-job:${chapterId}:${jenis}`;
}

export function simpanJobTertunda(
	chapterId: string,
	jenis: string,
	jobId: string,
): void {
	try {
		sessionStorage.setItem(kunci(chapterId, jenis), jobId);
	} catch {
		// Storage penuh/dimatikan browser - hilangnya cuma kemampuan resume,
		// bukan fungsi utamanya, jadi diam-diam dilewati saja.
	}
}

export function ambilJobTertunda(chapterId: string, jenis: string): string | null {
	try {
		return sessionStorage.getItem(kunci(chapterId, jenis));
	} catch {
		return null;
	}
}

export function hapusJobTertunda(chapterId: string, jenis: string): void {
	try {
		sessionStorage.removeItem(kunci(chapterId, jenis));
	} catch {
		// Sama seperti di atas - tidak fatal.
	}
}
