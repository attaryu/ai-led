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

/**
 * Warna **isian** untuk mark data — segmen bar komposisi di §4.0a. Keluarga
 * warnanya sama dengan badge di atas supaya satu peringkat selalu berwarna sama
 * di seluruh aplikasi, tapi nuansanya 600, bukan 100: badge menampung teks di
 * dalamnya sehingga latarnya harus pucat, sedangkan pada bar justru bidangnya
 * yang harus terbaca. Preseden yang sama dipakai `chapter-progress-bar.tsx`.
 *
 * Ketiga warna peringkat sudah **dihitung**, bukan ditaksir: lolos seluruh
 * pemeriksaan palet kategorikal (pita lightness, lantai chroma, keterpisahan
 * buta warna ΔE 16.1 protan, lantai penglihatan normal ΔE 16.9, kontras ≥ 3:1)
 * pada surface kartu terang maupun gelap.
 *
 * Slot keempat sengaja abu-abu netral, bukan warna keempat:
 * `BELUM_TERAKREDITASI` adalah **ketiadaan** peringkat, dan memberinya identitas
 * warna sendiri membuatnya terbaca sebagai capaian keempat — persis alasan
 * `BELUM_DIISI` diperlakukan sama di bar kelengkapan bab.
 */
export const accreditationRankFills: Record<PeringkatAkreditasi, string> = {
	UNGGUL: 'bg-emerald-600',
	BAIK_SEKALI: 'bg-sky-600',
	BAIK: 'bg-amber-600',
	BELUM_TERAKREDITASI: 'bg-muted-foreground/25',
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
