import { cn } from '~/core/lib/utils';
import {
	confidenceLabels,
	tingkatConfidence,
	type ConfidenceLevel,
} from '../../domain/entities/indicator-result.entity';
import { formatConfidence } from '../utils/assessment-format';

/**
 * Titik warna per tingkat. Sengaja **hanya titik**, bukan latar penuh seperti
 * badge status — lihat alasannya di bawah.
 */
const titik: Record<ConfidenceLevel, string> = {
	TINGGI: 'bg-emerald-500 dark:bg-emerald-400',
	SEDANG: 'bg-amber-500 dark:bg-amber-400',
	RENDAH: 'bg-red-500 dark:bg-red-400',
};

/**
 * Keyakinan penilai sebagai tiga tingkat, bukan desimal telanjang.
 *
 * Prototipe menampilkannya sebagai angka mentah (`0.85`, `0.75`) di kolom paling
 * kanan. Delapan puluh baris desimal berjajar tidak bisa dipindai, dan yang
 * sebenarnya ditanyakan pembaca bukan "berapa persisnya" melainkan "yang mana
 * yang harus saya periksa".
 *
 * **Sengaja dibuat tenang.** Versi sebelumnya berupa pil berwarna penuh, dan
 * karena skornya waktu itu cuma teks polos, keyakinan jadi elemen paling nyaring
 * di baris — hal pendukung mengalahkan hal pokok. Sekarang skor memegang warna
 * penuh lewat {@link ./assessment-score-chip AssessmentScoreChip} dan status
 * peninjauan memegang badge, jadi keyakinan turun jadi titik kecil beserta
 * kata — cukup untuk ditangkap saat memindai, tidak cukup untuk merebut
 * perhatian.
 *
 * Angka persisnya lewat `title`, bukan komponen `Tooltip`: badge ini hidup di
 * dalam baris yang bisa diklik, dan `TooltipTrigger` merender `<button>` —
 * tombol bersarang bukan HTML yang sah.
 */
export function AssessmentConfidenceBadge({
	nilai,
	className,
}: {
	nilai: number | null;
	className?: string;
}) {
	if (nilai === null) {
		return (
			<span
				title="Penilai tidak melaporkan tingkat keyakinannya untuk indikator ini."
				className={cn(
					'inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground',
					className,
				)}
			>
				<span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
				Keyakinan —
			</span>
		);
	}

	const tingkat = tingkatConfidence(nilai);

	return (
		<span
			title={formatConfidence(nilai)}
			className={cn(
				'inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground',
				className,
			)}
		>
			<span className={cn('size-1.5 shrink-0 rounded-full', titik[tingkat])} />
			Keyakinan {confidenceLabels[tingkat].toLowerCase()}
		</span>
	);
}
