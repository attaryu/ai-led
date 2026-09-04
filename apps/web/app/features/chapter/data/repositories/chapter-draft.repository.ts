import { type ChapterDraftEntity } from '../../domain/entities/chapter-draft.entity';
import { mapBabDraft } from '../sources/remote/chapter-draft.remote-source';
import { chapterRemoteSource } from '../sources/remote/chapter.remote-source';

export const chapterDraftRepository = {
	/** Event yang sama dengan fitur lain supaya daftar yang terpasang ikut segar. */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	/** Riwayat satu bab, `versi` terbesar di atas (§8.1). */
	async findByChapterId(chapterId: string): Promise<ChapterDraftEntity[]> {
		const rows = await chapterRemoteSource.findDrafts(chapterId);
		return rows.map(mapBabDraft).sort((a, b) => b.versi - a.versi);
	},

	/** Checkpoint manual — tombol "Simpan Draft" tab Draft (§8.1). */
	async create(input: {
		chapterId: string;
		label: string | null;
	}): Promise<ChapterDraftEntity> {
		const row = await chapterRemoteSource.createDraft(input.chapterId, input.label);
		this.notify();
		return mapBabDraft(row);
	},
};
