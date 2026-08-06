export const userLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('user_data');
	},
	setAll(data: string): void {
		localStorage.setItem('user_data', data);
	},
};
