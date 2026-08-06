import * as React from 'react';

import { chapterRepository } from '~/features/chapter/data/repositories/chapter.repository';
import {
	pickChaptersNeedingAttention,
	summarizeChapters,
	type ChapterAttention,
	type ChapterEntity,
	type ChapterSummary,
} from '~/features/chapter/domain/entities/chapter.entity';
import { evidenceRepository } from '~/features/evidence/data/repositories/evidence.repository';

export type ProjectProgress = {
	chapters: ChapterEntity[];
	summary: ChapterSummary;
	attention: ChapterAttention[];
	/** Bukti dukung yang tersedia untuk prodi pemilik dokumen (tenant + prodi). */
	buktiDukungTersedia: number;
};

function read(
	ledProjectId: string,
	studyProgramId: string,
): ProjectProgress {
	const chapters = chapterRepository.findByProjectId(ledProjectId);

	return {
		chapters,
		summary: summarizeChapters(chapters),
		attention: pickChaptersNeedingAttention(chapters),
		buktiDukungTersedia:
			evidenceRepository.findAvailableForStudyProgram(studyProgramId).length,
	};
}

/**
 * Seluruh angka Dashboard Project LED dalam satu tempat, supaya halaman tinggal
 * merender. Berlangganan `storage-update` seperti daftar lain di aplikasi ini —
 * dokumen bisa berubah dari tab/halaman lain (mis. bukti dukung baru diunggah).
 *
 * Perhitungannya sendiri hidup di domain (`summarizeChapters`), bukan di sini,
 * agar bisa dipakai ulang oleh dashboard agregat prodi/institusi nanti.
 */
export function useProjectProgress(
	ledProjectId: string,
	studyProgramId: string,
): ProjectProgress {
	const [progress, setProgress] = React.useState<ProjectProgress>(() =>
		read(ledProjectId, studyProgramId),
	);

	React.useEffect(() => {
		const load = () => setProgress(read(ledProjectId, studyProgramId));
		load();
		window.addEventListener('storage-update', load);
		return () => window.removeEventListener('storage-update', load);
	}, [ledProjectId, studyProgramId]);

	return progress;
}
