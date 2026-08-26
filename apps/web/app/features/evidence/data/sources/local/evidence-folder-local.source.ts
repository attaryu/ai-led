/**
 * Kunci terpisah dari `evidence_data`, mengikuti keputusan di kepala
 * `evidence-folder.entity.ts`: folder bukan berkas, dan koleksinya tidak boleh
 * bercampur supaya angka kesiapan yang dihitung fitur lain tetap benar.
 */
export const evidenceFolderLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('evidence_folder_data');
	},
	setAll(data: string): void {
		localStorage.setItem('evidence_folder_data', data);
	},
};
