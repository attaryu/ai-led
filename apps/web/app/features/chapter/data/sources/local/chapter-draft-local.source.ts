/** `_v2`: bentuk barisnya pernah berubah, key lama sengaja ditinggal biar tidak lolos parse ke bentuk baru. */
export const chapterDraftLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('chapter_draft_data_v2');
	},
	setAll(data: string): void {
		localStorage.setItem('chapter_draft_data_v2', data);
	},
};
