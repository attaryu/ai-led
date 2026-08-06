export const chapterDraftLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('chapter_draft_data');
	},
	setAll(data: string): void {
		localStorage.setItem('chapter_draft_data', data);
	},
};
