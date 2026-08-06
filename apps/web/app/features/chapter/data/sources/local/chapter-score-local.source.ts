/** Bernomor dengan alasan yang sama seperti `chapter-local.source.ts`. */
export const chapterScoreLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('chapter_score_data_v1');
	},
	setAll(data: string): void {
		localStorage.setItem('chapter_score_data_v1', data);
	},
};
