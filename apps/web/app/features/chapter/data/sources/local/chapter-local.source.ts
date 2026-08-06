/**
 * Key-nya bernomor karena bentuk barisnya pernah berubah: `buktiDukungIds:
 * string[]` jadi `buktiDukung: BuktiDukungRef[]`.
 *
 * Nomor ini **bukan** pengaman utamanya, dan sempat keliru diperlakukan begitu:
 * ia hanya menolong halaman yang dimuat ulang seutuhnya. Saat modul ini masih
 * versi lama sementara entitasnya sudah baru — pemuatan ulang sebagian di dev
 * server — key lamalah yang dibaca, dan bentuk lamanya lolos begitu saja.
 * Penjaga sebenarnya ada di `chapterRepository.findAll`, yang memvalidasi isinya
 * dengan skema zod dan menyeed ulang begitu bentuknya tidak cocok. Perubahan
 * bentuk berikutnya tidak perlu menaikkan nomor ini lagi.
 */
export const chapterLocalSource = {
	getAll(): string | null {
		return localStorage.getItem('chapter_data_v2');
	},
	setAll(data: string): void {
		localStorage.setItem('chapter_data_v2', data);
	},
};
