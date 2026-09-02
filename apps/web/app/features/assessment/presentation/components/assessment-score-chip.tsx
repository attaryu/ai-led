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
 *
 * `maksimal` tetap diterima walau angkanya tidak lagi ditulis. Akhiran "/4"
 * dibuang 2026-09-02: pembagi yang sama diulang delapan belas kali tidak
 * menambah apa pun. Tapi skalanya masih menentukan warna chip ini, dan sejak
 * rubrik diunggah per set akreditasi ia bukan konstanta yang boleh ditebak di
 * sini. Skala itu kini disebut sekali saja, di kartu Skor Rata-rata.
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

/**
 * Dua ukuran, dipilih lewat tempatnya berdiri — bukan lewat `className` dari
 * pemanggil. Baris daftar dan panel detail memakai komponen yang sama; kalau
 * salah satunya ditambal dari luar, keduanya perlahan menyimpang tanpa ada yang
 * menyadari sampai keduanya terlihat berdampingan.
 */
const UKURAN = {
	baris: 'px-2 py-1 text-base',
	panel: 'px-2.5 py-1.5 text-xl',
} as const;

export function AssessmentScoreChip({
	skor,
	maksimal,
	ukuran = 'baris',
	className,
}: {
	skor: number | null;
	maksimal: number;
	ukuran?: keyof typeof UKURAN;
	className?: string;
}) {
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center rounded-md border font-heading font-bold tabular-nums',
				UKURAN[ukuran],
				nada(skor, maksimal),
				className,
			)}
		>
			{formatSkor(skor)}
		</span>
	);
}
