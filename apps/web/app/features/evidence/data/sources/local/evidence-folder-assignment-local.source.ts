/**
 * evidence.folderId sekarang datang dari backend sungguhan (selalu `null` —
 * belum ada kolomnya di Prisma), jadi penugasan folder oleh pengguna disimpan
 * di sini, terpisah dari baris bukti dukung itu sendiri: peta `evidenceId ->
 * folderId`, bukan bagian dari data yang dibaca ulang dari server tiap kali.
 */
export const evidenceFolderAssignmentLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('evidence_folder_assignment_data');
	},
	setAll(data: string): void {
		localStorage.setItem('evidence_folder_assignment_data', data);
	},
};
