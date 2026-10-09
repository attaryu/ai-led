import { mapChapterSection } from '../backend-mappers';
import { type ChapterSectionEntity } from '../../domain/entities/chapter-section.entity';
import { type SectionDraftEntity } from '../../domain/entities/section-draft.entity';
import {
	mapSectionDraft,
	sectionDraftRemoteSource,
} from '../sources/remote/section-draft.remote-source';
import { chapterRemoteSource } from '../sources/remote/chapter.remote-source';

export const sectionDraftRepository = {
	/** Event yang sama dengan fitur lain supaya daftar yang terpasang ikut segar. */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	/** Riwayat satu section, `versi` terbesar di atas. */
	async findBySectionId(
		chapterId: string,
		sectionId: string,
	): Promise<SectionDraftEntity[]> {
		const daftar = await sectionDraftRemoteSource.findBySectionId(chapterId, sectionId);
		return daftar.sort((a, b) => b.versi - a.versi);
	},

	/** Checkpoint manual — tombol "Simpan Draft" tab Draft, atau "Simpan sebagai draft" tab Generasi. */
	async create(input: {
		chapterId: string;
		sectionId: string;
		label: string | null;
	}): Promise<SectionDraftEntity> {
		const row = await chapterRemoteSource.createSectionDraft(
			input.chapterId,
			input.sectionId,
			input.label,
		);
		this.notify();
		return mapSectionDraft(row);
	},

	/** Pulihkan section ke isi salah satu checkpoint-nya — mengembalikan section yang sudah diperbarui. */
	async restore(
		chapterId: string,
		sectionId: string,
		draftId: string,
	): Promise<ChapterSectionEntity> {
		const row = await chapterRemoteSource.restoreSectionDraft(chapterId, sectionId, draftId);
		this.notify();
		return mapChapterSection(row);
	},

	/**
	 * Hapus satu checkpoint. `notify()` seperti create/restore -- panel yang
	 * mendengarkan `storage-update` menyegarkan daftarnya sendiri.
	 */
	async remove(chapterId: string, sectionId: string, draftId: string): Promise<void> {
		await chapterRemoteSource.deleteSectionDraft(chapterId, sectionId, draftId);
		this.notify();
	},
};
