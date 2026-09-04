import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/core/components/ui/tooltip';
import { cn } from '~/core/lib/utils';
import {
	chapterProgressLabels,
	chapterProgressOrder,
	type ChapterProgress,
	type ChapterSummary,
} from '~/features/chapter/domain/entities/chapter.entity';

/**
 * Warna isi bar, sekeluarga dengan `ChapterStatusBadge` yang berdiri di
 * sebelahnya di Dashboard Project LED — badge memakai nuansa 100/800 karena ada
 * teks di dalamnya, bar memakai 500 karena yang harus terbaca justru bidangnya.
 */
const segmentStyles: Record<ChapterProgress, string> = {
	TERKUNCI: 'bg-emerald-500',
	MENUNGGU_REVIEW: 'bg-sky-500',
	SEDANG_DISUSUN: 'bg-amber-500',
	// Bukan bidang berwarna: "belum diisi" adalah sisa, dan sisa dibaca dari ruang
	// yang belum terisi — memberinya warna sendiri membuatnya terlihat sebagai
	// capaian keempat.
	BELUM_DIISI: 'bg-muted-foreground/20',
};

/**
 * Pembagian bab satu Dokumen LED dalam satu bar (docs/application_flow.md
 * §5.1b, §4.0c).
 *
 * Dipakai di Dashboard Program Studi sebagai ganti empat kartu angka: pertanyaan di
 * lapis prodi hanya "sejauh apa dokumennya berjalan", dan satu bidang yang
 * terbagi menjawab itu lebih cepat daripada empat persentase yang harus
 * dijumlahkan sendiri oleh pembacanya. Rinciannya tetap hidup di Dashboard
 * Project LED (§6.1).
 *
 * Angkanya diambil dari `summary.perStatus` — bukan dari `terisi`/`terkunci`
 * yang boleh tumpang tindih — karena bar bertumpuk hanya jujur bila segmennya
 * saling lepas dan totalnya persis jumlah bab.
 *
 * Tiap segmen adalah tombol pemicu tooltip, bukan `div` mati. Di dalam sel tabel
 * (§4.0c) legendanya tidak muat, jadi tooltip itulah satu-satunya cara warna
 * menyebutkan namanya — dan karena pemicunya tombol sungguhan, keterangannya
 * juga terjangkau keyboard, bukan hanya kursor.
 */
export function ChapterProgressBar({
	summary,
	showLegend = true,
	className,
}: {
	summary: ChapterSummary;
	/** Dimatikan di dalam sel tabel yang tidak punya ruang untuk legenda. */
	showLegend?: boolean;
	className?: string;
}) {
	const { total, perStatus } = summary;

	// Dokumen yang belum punya bab sama sekali bukan dokumen yang 0% jalan: tidak
	// ada yang bisa dibagi, jadi dikatakan apa adanya alih-alih dirender sebagai
	// bar kosong yang terbaca "semua bab belum diisi".
	if (total === 0) {
		return (
			<div className={cn('flex flex-col gap-2', className)}>
				<div className="h-2 w-full rounded-full bg-muted" />
				<p className="text-xs text-muted-foreground">
					Dokumen ini belum punya bab.
				</p>
			</div>
		);
	}

	const terpakai = chapterProgressOrder.filter((status) => perStatus[status] > 0);

	return (
		<div className={cn('flex flex-col gap-2', className)}>
			<div
				className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-valuenow={summary.persenKelengkapan}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Kelengkapan bab"
			>
				{terpakai.map((status) => {
					const jumlah = perStatus[status];
					const persen = Math.round((jumlah / total) * 100);

					return (
						<Tooltip key={status}>
							{/*
							 * `TooltipTrigger` Base UI merender `<button>`, jadi lebarnya
							 * harus tetap menempel di pemicu itu sendiri supaya pembagian
							 * flex-nya bertahan, dan gaya bawaan tombol perlu dinolkan agar
							 * segmennya tetap setipis bar.
							 */}
							<TooltipTrigger
								aria-label={`${chapterProgressLabels[status]}: ${jumlah} bab`}
								className={cn(
									'block h-full cursor-default border-0 p-0',
									segmentStyles[status],
								)}
								style={{ width: `${(jumlah / total) * 100}%` }}
							/>
							<TooltipContent>
								{chapterProgressLabels[status]} — {jumlah} bab ({persen}%)
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>

			{/*
			 * Legenda hanya memuat status yang benar-benar ada isinya. Baris "0
			 * terkunci" tidak menambah apa pun yang tidak sudah terbaca dari bar, dan
			 * legenda yang selalu empat baris justru menenggelamkan yang berubah.
			 */}
			{showLegend && (
				<ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
					{terpakai.map((status) => (
						<li key={status} className="flex items-center gap-1.5">
							<span
								aria-hidden
								className={cn(
									'size-2 shrink-0 rounded-full',
									segmentStyles[status],
								)}
							/>
							<span className="tabular-nums">{perStatus[status]}</span>
							{chapterProgressLabels[status].toLowerCase()}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
