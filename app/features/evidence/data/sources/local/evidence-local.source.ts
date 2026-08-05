export const evidenceLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('evidence_data');
	},
	setAll(data: string): void {
		localStorage.setItem('evidence_data', data);
	},
};
