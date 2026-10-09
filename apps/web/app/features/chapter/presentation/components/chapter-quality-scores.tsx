import { InfoIcon } from '@phosphor-icons/react';
import * as React from 'react';

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/core/components/ui/tooltip';
import {
	RAGAS_METRIK_INFO,
	RAGAS_URUTAN,
	type RagasScore,
} from '../../domain/entities/ragas-score.entity';

/**
 * Kata penjelas untuk satu skor 0–1. Hanya teks netral di bawah bilah -- tanpa warna
 * penilaian (hijau/merah): tampilannya sengaja satu warna (primary) agar tetap sobrio.
 * Ambangnya heuristik tampilan, bukan standar RAGAS; skornya sendiri tidak berubah.
 */
function keterangan(nilai: number): string {
	if (nilai >= 0.8) return 'Sangat baik';
	if (nilai >= 0.6) return 'Baik';
	if (nilai >= 0.4) return 'Cukup';
	return 'Perlu perhatian';
}

/** Bilah progres; panjangnya "tumbuh" sekali saat tampil (dimatikan bila pengguna meminta gerak dikurangi). */
function Bilah({ nilai, tebal }: { nilai: number; tebal?: boolean }) {
	const [tampil, setTampil] = React.useState(false);
	React.useEffect(() => {
		const id = requestAnimationFrame(() => setTampil(true));
		return () => cancelAnimationFrame(id);
	}, []);
	const persen = Math.round(Math.min(Math.max(nilai, 0), 1) * 100);

	return (
		<div
			role="meter"
			aria-valuenow={persen}
			aria-valuemin={0}
			aria-valuemax={100}
			className={`w-full overflow-hidden rounded-full bg-muted ${tebal ? 'h-2.5' : 'h-2'}`}
		>
			<div
				className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
				style={{ width: tampil ? `${persen}%` : '0%' }}
			/>
		</div>
	);
}

/**
 * Skor kualitas satu generate: ringkasan rata-rata di atas, lalu satu kartu per metrik dengan
 * bilah progres. Definisi tiap metrik ada di tooltip ikon info.
 */
export function ChapterQualityScores({ ragas }: { ragas: RagasScore }) {
	const baris = RAGAS_URUTAN.map((nama) => ragas.metrik.find((m) => m.metrik === nama)).filter(
		(m): m is NonNullable<typeof m> => !!m,
	);
	if (baris.length === 0) return null;

	const rata = baris.reduce((jumlah, m) => jumlah + m.nilai, 0) / baris.length;

	return (
		<div className="space-y-2.5 pt-1">
			<div className="space-y-2.5 rounded-xl bg-primary/5 px-4 py-3.5 ring-1 ring-primary/10">
				<div className="flex items-end justify-between gap-3">
					<div className="min-w-0">
						<p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
							Skor rata-rata
						</p>
						<p className="text-xs text-muted-foreground">{keterangan(rata)}</p>
					</div>
					<p className="text-3xl leading-none font-semibold text-primary tabular-nums">
						{rata.toFixed(2)}
					</p>
				</div>
				<Bilah nilai={rata} tebal />
			</div>

			{baris.map((m) => {
				const info = RAGAS_METRIK_INFO[m.metrik];
				return (
					<div key={m.metrik} className="space-y-2 rounded-xl border border-border bg-card px-3.5 py-3">
						<div className="flex items-center justify-between gap-2">
							<div className="flex min-w-0 items-center gap-1.5">
								<p className="truncate text-xs font-medium">{info.label}</p>
								<Tooltip>
									<TooltipTrigger
										aria-label={`Apa yang diukur ${info.label}`}
										className="shrink-0 rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
									>
										<InfoIcon className="size-3.5" />
									</TooltipTrigger>
									<TooltipContent side="left" className="leading-relaxed whitespace-pre-line">
										{info.diukur}
										{m.alasan.trim() ? `\n\n${m.alasan}` : ''}
									</TooltipContent>
								</Tooltip>
							</div>
							<p className="shrink-0 text-sm font-semibold tabular-nums">{m.nilai.toFixed(2)}</p>
						</div>
						<Bilah nilai={m.nilai} />
						<p className="text-[11px] text-muted-foreground">{keterangan(m.nilai)}</p>
					</div>
				);
			})}
		</div>
	);
}
