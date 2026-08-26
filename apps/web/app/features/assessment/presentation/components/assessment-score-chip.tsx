import { cn } from '~/core/lib/utils';
import { formatSkor } from '../utils/assessment-format';

/**
 * Skor indikator sebagai chip bernada warna.
 *
 * **Ini elemen paling nyaring di satu baris, dan itu disengaja.** Versi pertama
 * daftar ini menulis skor sebagai teks polos sementara badge keyakinan berwarna,
 * sehingga hal yang paling menentukan justru paling sunyi dan hal pendukung
 * paling berteriak. Pembaca yang memindai delapan belas baris menangkap warna
 * lebih dulu, jadi warnanya harus menandai skor.
 *
 * Nadanya mengikuti **skor final** — yang berlaku setelah keputusan Penjamin
 * Mutu, bukan angka AI. Baris ini menjawab "berapa nilai indikator ini",
 * bukan "berapa tebakan AI-nya".
 */
function nada(skor: number | null, maksimal: number): string {
	if (skor === null) {
		return 'bg-muted text-muted-foreground border-border';
	}

	// Ambangnya proporsional terhadap skala, bukan angka mati: skala 0–4 hari ini
	// bisa jadi 0–5 saat matriks LAM yang sebenarnya masuk, dan ambang mati akan
	// diam-diam salah warna tanpa ada yang menangkapnya.
	const rasio = maksimal === 0 ? 0 : skor / maksimal;

	if (rasio >= 0.75) {
		return 'bg-emerald-100 text-emerald-800 border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40';
	}
	if (rasio >= 0.5) {
		return 'bg-amber-100 text-amber-800 border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40';
	}
	return 'bg-red-100 text-red-800 border-red-200/60 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/40';
}

export function AssessmentScoreChip({
	skor,
	maksimal,
	className,
}: {
	skor: number | null;
	maksimal: number;
	className?: string;
}) {
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-baseline gap-0.5 rounded-md border px-2 py-1 font-heading text-base font-bold tabular-nums',
				nada(skor, maksimal),
				className,
			)}
		>
			{formatSkor(skor)}
			<span className="text-[10px] font-medium opacity-70">/{maksimal}</span>
		</span>
	);
}
