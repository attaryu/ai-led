export const accreditationSetLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('accreditation_set_data');
	},
	setAll(data: string): void {
		localStorage.setItem('accreditation_set_data', data);
	},
};
