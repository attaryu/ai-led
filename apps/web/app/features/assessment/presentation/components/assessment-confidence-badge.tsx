import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/core/components/ui/tooltip';
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
 * Keterangan yang muncul saat badge-nya disentuh tetikus.
 *
 * Kalimat keduanya bukan basa-basi. Data benchmark di `apps/ai/data/` (tiga model
 * × 60 indikator terhadap skor referensi manusia) menunjukkan indikator
 * berkeyakinan **tinggi justru rata-rata meleset lebih jauh** daripada yang
 * sedang — 1,06 vs 0,60 pada qwen3.5, 1,42 vs 1,19 pada mistral-small3.2. Tanpa
 * kalimat itu, label "Tinggi" terbaca sebagai jaminan mutu yang tidak pernah
 * diberikan siapa pun.
 */
function keterangan(nilai: number): string {
	return `Keyakinan penilai AI terhadap penilaiannya sendiri (${formatConfidence(nilai)}). Dilaporkan oleh model, bukan ukuran ketepatan.`;
}

/** Gaya badge-nya sama di kedua cabang; dipisah supaya tidak tertulis dua kali. */
const gayaBadge =
	'inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground';

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
 * **`render={<span />}` bukan pilihan gaya, melainkan syarat kebenaran.** Badge
 * ini hidup di dalam baris daftar yang seluruhnya sebuah `<button>`, sedangkan
 * `TooltipTrigger` bawaannya merender `<button>` juga — tombol bersarang bukan
 * HTML yang sah, dan versi pertama fitur ini memang sempat memunculkan galat
 * hidrasi karenanya. Prop `render` milik Base UI menukar elemennya jadi `<span>`
 * tanpa kehilangan perilaku tooltipnya; pola yang sama dipakai
 * `BreadcrumbLink render={<Link/>}` di `app-shell.tsx`. Isi tooltipnya sendiri
 * dirender lewat portal, jadi ia tidak ikut bersarang di dalam tombol.
 *
 * Sempat memakai atribut `title` untuk menghindari masalah itu; diganti karena
 * `title` baru muncul setelah jeda sekitar sedetik, tidak bisa digayakan, dan
 * pada baris yang sudah punya `title` lain ia bertabrakan.
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
			<Tooltip>
				<TooltipTrigger render={<span />} className={cn(gayaBadge, className)}>
					<span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
					Keyakinan —
				</TooltipTrigger>
				<TooltipContent className="leading-relaxed">
					Penilai tidak melaporkan tingkat keyakinannya untuk indikator ini.
				</TooltipContent>
			</Tooltip>
		);
	}

	const tingkat = tingkatConfidence(nilai);

	return (
		<Tooltip>
			<TooltipTrigger render={<span />} className={cn(gayaBadge, className)}>
				<span className={cn('size-1.5 shrink-0 rounded-full', titik[tingkat])} />
				Keyakinan {confidenceLabels[tingkat].toLowerCase()}
			</TooltipTrigger>
			<TooltipContent className="leading-relaxed">
				{keterangan(nilai)}
			</TooltipContent>
		</Tooltip>
	);
}
