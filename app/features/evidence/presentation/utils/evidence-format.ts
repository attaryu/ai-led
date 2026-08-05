import {
	FileIcon,
	FileDocIcon,
	FileImageIcon,
	FilePdfIcon,
	FileXlsIcon,
	type Icon,
} from '@phosphor-icons/react';

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

export function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/**
 * Waktu relatif ("2 jam lalu"). Murni pemanis tampilan, jadi tinggal di layer
 * presentasi sesuai catatan fleksibilitas struktur di docs/ARCHITECTURE.md.
 */
export function formatRelativeTime(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const diffMinutes = Math.round(diffMs / 60000);

	if (diffMinutes < 1) return 'baru saja';
	if (diffMinutes < 60) return `${diffMinutes} menit lalu`;

	const diffHours = Math.round(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours} jam lalu`;

	const diffDays = Math.round(diffHours / 24);
	if (diffDays < 30) return `${diffDays} hari lalu`;

	return new Date(iso).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
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
