export const ledProjectLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('led_project_data');
	},
	setAll(data: string): void {
		localStorage.setItem('led_project_data', data);
	},
};
