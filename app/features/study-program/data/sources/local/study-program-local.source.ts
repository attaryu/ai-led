export const studyProgramLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('study_program_data');
	},
	setAll(data: string): void {
		localStorage.setItem('study_program_data', data);
	},
};
