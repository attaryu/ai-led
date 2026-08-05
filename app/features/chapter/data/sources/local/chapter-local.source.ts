export const chapterLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('chapter_data');
	},
	setAll(data: string): void {
		localStorage.setItem('chapter_data', data);
	},
};
