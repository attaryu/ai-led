import { cn } from '~/core/lib/utils';
import {
	PERINGKAT_AKREDITASI_LABEL,
	type PeringkatAkreditasi,
} from '../../domain/entities/study-program.entity';

/**
 * Warna mengikuti keluarga badge yang sudah ada di aplikasi ini: emerald untuk
 * keadaan terbaik, slate untuk "belum apa-apa". Sky dipakai untuk Baik Sekali
 * agar tetap terbaca sebagai peringkat tinggi tanpa menyamai Unggul.
 */
const rankStyles: Record<PeringkatAkreditasi, string> = {
	UNGGUL:
		'bg-emerald-100 text-emerald-800 border-emerald-200/50 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/30',
	BAIK_SEKALI:
		'bg-sky-100 text-sky-800 border-sky-200/50 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800/30',
	BAIK: 'bg-amber-100 text-amber-800 border-amber-200/50 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/30',
	BELUM_TERAKREDITASI:
		'bg-slate-100 text-slate-800 border-slate-200/50 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800/30',
};

/** `PROGRAM_STUDI.peringkat_akreditasi` (docs/application_flow.md §5.1). */
export function AccreditationRankBadge({
	peringkat,
	className,
}: {
	peringkat: PeringkatAkreditasi;
	className?: string;
}) {
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
				rankStyles[peringkat],
				className,
			)}
		>
			{PERINGKAT_AKREDITASI_LABEL[peringkat]}
		</span>
	);
}
