/**
 * Mengingat tab panel kanan Editor Bab yang terakhir dipilih, di browser pengguna.
 *
 * Ruang kerja editor dipasang ulang tiap pindah bab/sub-bab (`key={chapter.id}:{sectionId}`) dan state-nya hilang
 * saat halaman dimuat ulang, jadi tanpa ini tab selalu kembali ke bawaan. Sengaja satu kunci untuk seluruh editor,
 * bukan per bab: tab yang dipilih adalah cara kerja pengguna (mis. selalu di Panduan), bukan keadaan satu bab.
 *
 * Penyimpanan browser bisa kosong, ditolak, atau melempar (jendela privat, data situs diblokir): setiap akses
 * dibungkus try/catch dan editornya tetap jalan tanpa ingatan.
 */
const KUNCI = 'ai-led:editor-bab:tab-panel';

type Penyimpanan = Pick<Storage, 'getItem' | 'setItem'>;

function bawaan(): Penyimpanan | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/** Tab tersimpan bila masih valid (tab yang disembunyikan atau dihapus tidak boleh dipulihkan), selain itu `null`. */
export function bacaTabTersimpan<T extends string>(
	tabValid: readonly T[],
	penyimpanan: Penyimpanan | null = bawaan(),
): T | null {
	try {
		const nilai = penyimpanan?.getItem(KUNCI);
		return nilai && (tabValid as readonly string[]).includes(nilai) ? (nilai as T) : null;
	} catch {
		return null;
	}
}

export function simpanTab(tab: string, penyimpanan: Penyimpanan | null = bawaan()): void {
	try {
		penyimpanan?.setItem(KUNCI, tab);
	} catch {
		// tanpa ingatan: tidak apa-apa
	}
}
