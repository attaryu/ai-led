export const sessionLocalSource = {
	get(): string | null {
		if (typeof window === 'undefined') return null;
		return localStorage.getItem('session_data');
	},
	set(data: string): void {
		if (typeof window === 'undefined') return;
		localStorage.setItem('session_data', data);
	},
};
