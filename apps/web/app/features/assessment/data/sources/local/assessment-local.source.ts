/**
 * Tiga blob terpisah, bukan satu objek bersarang.
 *
 * Hasil AI ditimpa tiap penilaian ulang sementara keputusan Penjamin Mutu
 * harus bertahan melewatinya — memasukkan keduanya ke satu key membuat penulisan
 * yang satu selalu menyentuh yang lain, dan cukup satu kekeliruan penyalinan
 * untuk menghapus keputusan yang seharusnya kekal.
 */
export const assessmentLocalSource = {
	getSessions(): string | null {
		return localStorage.getItem('assessment_sessions');
	},
	setSessions(data: string): void {
		localStorage.setItem('assessment_sessions', data);
	},

	getResults(): string | null {
		return localStorage.getItem('assessment_results');
	},
	setResults(data: string): void {
		localStorage.setItem('assessment_results', data);
	},

	getVerdicts(): string | null {
		return localStorage.getItem('assessment_verdicts');
	},
	setVerdicts(data: string): void {
		localStorage.setItem('assessment_verdicts', data);
	},
};
