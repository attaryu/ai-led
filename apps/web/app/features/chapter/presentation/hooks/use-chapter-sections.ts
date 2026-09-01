import * as React from 'react';

import { streamSse } from '~/core/lib/sse-client';
import { chapterRepository } from '../../data/repositories/chapter.repository';
import { type ChapterSectionEntity } from '../../domain/entities/chapter-section.entity';

/** Bentuk event `GET jobs/:id/events` untuk GENERASI_OUTLINE_BAB. */
type OutlineJobEvent = {
	jobId: string;
	status: 'progress' | 'completed' | 'failed';
	result?: { status: 'completed' | 'error'; sectionCount?: number; error?: string };
	error?: string;
};

export type StatusOutline = 'diam' | 'berjalan' | 'gagal';

/**
 * Daftar section (outline) satu bab, plus pemicu GENERASI_OUTLINE_BAB.
 * Generate per-section sendiri tetap lewat `useChapterGeneration.jalankanGenerate`
 * (evidence/prompt dikelola di sana) — `refetch()` di sini dipanggil sesudahnya
 * supaya status/isi barisnya ikut segar.
 */
export function useChapterSections(chapterId: string) {
	const [sections, setSections] = React.useState<ChapterSectionEntity[]>([]);
	const [dimuat, setDimuat] = React.useState(false);
	const [status, setStatus] = React.useState<StatusOutline>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	const refetch = React.useCallback(async () => {
		const rows = await chapterRepository.findSections(chapterId);
		setSections(rows);
		setDimuat(true);
	}, [chapterId]);

	React.useEffect(() => {
		setDimuat(false);
		void refetch();
	}, [refetch]);

	const generateOutline = React.useCallback(
		async (overwrite?: boolean) => {
			if (status === 'berjalan') return;
			setStatus('berjalan');
			setPesanGagal(null);

			try {
				const job = await chapterRepository.triggerGenerateOutline(chapterId, overwrite);

				let hasil: OutlineJobEvent | null = null;
				for await (const event of streamSse<OutlineJobEvent>(`/jobs/${job.id}/events`)) {
					if (event.status === 'completed' || event.status === 'failed') {
						hasil = event;
						break;
					}
				}

				if (!hasil || hasil.status === 'failed' || hasil.result?.status === 'error') {
					setStatus('gagal');
					setPesanGagal(
						hasil?.result?.error ?? hasil?.error ?? 'Penyusunan outline gagal. Coba lagi.',
					);
					return;
				}

				await refetch();
				setStatus('diam');
			} catch {
				setStatus('gagal');
				setPesanGagal('Penyusunan outline gagal. Periksa koneksi lalu coba lagi.');
			}
		},
		[chapterId, status, refetch],
	);

	return { sections, dimuat, status, pesanGagal, generateOutline, refetch };
}
