import {
	FileIcon,
	FileDocIcon,
	FileImageIcon,
	FilePdfIcon,
	FileXlsIcon,
	type Icon,
} from '@phosphor-icons/react';

/**
 * Pemformat khusus berkas. Pemformat waktu (`formatDate`, `formatDateTime`,
 * `formatRelativeTime`) sudah pindah ke `~/core/lib/format-time` karena dipakai
 * lintas fitur; yang tersisa di sini benar-benar hanya soal berkas.
 */

/** Ukuran berkas dalam satuan yang enak dibaca manusia. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

type FileVisual = { Icon: Icon; className: string };

/** Ikon + warna per tipe berkas, dipakai kartu maupun baris tabel. */
export function getFileVisual(tipeFile: string): FileVisual {
	switch (tipeFile.toLowerCase()) {
		case 'pdf':
			return { Icon: FilePdfIcon, className: 'text-red-600 dark:text-red-400' };
		case 'doc':
		case 'docx':
			return {
				Icon: FileDocIcon,
				className: 'text-blue-600 dark:text-blue-400',
			};
		case 'xls':
		case 'xlsx':
			return {
				Icon: FileXlsIcon,
				className: 'text-emerald-600 dark:text-emerald-400',
			};
		case 'jpg':
		case 'jpeg':
		case 'png':
			return {
				Icon: FileImageIcon,
				className: 'text-violet-600 dark:text-violet-400',
			};
		default:
			return { Icon: FileIcon, className: 'text-muted-foreground' };
	}
}
