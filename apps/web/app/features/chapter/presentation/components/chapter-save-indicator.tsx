import { CheckCircleIcon } from '@phosphor-icons/react';
import * as React from 'react';

import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { type AutosaveStatus } from '../hooks/use-chapter-autosave';

/** Sesering apa label diperbarui; satuan terkecil yang ditampilkan adalah menit. */
const DETAK_MS = 30_000;

/**
 * Indikator "Tersimpan X menit yang lalu" di header Editor Bab
 * (docs/application_flow.md §7.2).
 *
 * Detaknya ditaruh di sini, bukan di hook autosave, karena label ini menua
 * sendiri: `savedAt` tidak berubah, yang berubah "sekarang". Dengan begitu satu
 * detak me-render ulang sepotong teks, bukan seluruh kanvas editor.
 */
export function ChapterSaveIndicator({
	status,
	savedAt,
}: {
	status: AutosaveStatus;
	savedAt: string | null;
}) {
	const [, detak] = React.useReducer((n: number) => n + 1, 0);

	React.useEffect(() => {
		const id = window.setInterval(detak, DETAK_MS);
		return () => window.clearInterval(id);
	}, []);

	if (status === 'menyimpan') {
		return (
			<span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
				Menyimpan…
			</span>
		);
	}

	if (!savedAt) {
		return (
			<span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
				Belum pernah disimpan
			</span>
		);
	}

	return (
		<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
			<CheckCircleIcon weight="fill" className="size-3.5" />
			Tersimpan {formatRelativeTimeLong(savedAt)}
		</span>
	);
}
