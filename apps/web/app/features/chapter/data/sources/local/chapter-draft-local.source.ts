/** Bernomor dengan alasan yang sama seperti `chapter-local.source.ts`. */
export const chapterDraftLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('chapter_draft_data_v2');
	},
	setAll(data: string): void {
		localStorage.setItem('chapter_draft_data_v2', data);
	},
};
