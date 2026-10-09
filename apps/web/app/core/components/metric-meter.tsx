import { InfoIcon } from '@phosphor-icons/react';

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/core/components/ui/tooltip';
import { cn } from '~/core/lib/utils';

/**
 * Satu metrik RAGAS: nilai, bilah, apa yang diukur, dan alasan angkanya.
 *
 * Ditaruh di `core` karena dua permukaan memakainya dengan bentuk yang sama
 * persis — tab "Kualitas AI" di Editor Bab (mutu generasi bab) dan tab "Kualitas
 * Penilaian" di Penilaian AMI (mutu kerja mesin penilai). Yang berbeda hanya
 * daftar metriknya dan label kotak alasannya; menyalin komponennya berarti
 * memelihara dua kartu yang harus tetap terlihat sama tanpa satu pun mekanisme
 * yang memaksanya.
 *
 * Tanpa accordion — jumlah metriknya sedikit, dan menyembunyikan penjelasannya
 * di balik klik justru mengembalikan masalah yang membuat kartu ini perlu ada:
 * angka tanpa arti bagi siapa pun di luar tim RAG.
 */
export function MetricMeter({
	label,
	diukur,
	nilai,
	alasan,
	alasanLabel,
	className,
}: {
	label: string;
	/** Definisi metriknya, muncul di tooltip ikon info. */
	diukur: string;
	/** 0–1, sesuai rentang bawaan Ragas. */
	nilai: number;
	/** Kenapa angkanya segitu pada kejadian yang sedang dilihat. */
	alasan: string;
	/** Judul kotak alasan, mis. "Pada generate ini" / "Pada penilaian ini". Kosong = tanpa judul. */
	alasanLabel?: string;
	className?: string;
}) {
	const persen = Math.round(nilai * 100);

	return (
		<div className={cn('space-y-1.5', className)}>
			<div className="flex items-baseline justify-between gap-2">
				<p className="flex min-w-0 items-center gap-1 text-xs font-medium">
					<span className="truncate">{label}</span>

					{/*
					 * Definisi metriknya disembunyikan di balik ikon ini. Ia hanya perlu
					 * dibaca sekali — sesudah paham apa itu "kesetiaan pada sumber",
					 * mengulangnya di tiap kartu setiap kali tab dibuka hanya mendorong
					 * temuan yang sebenarnya (alasan di bawah) keluar layar.
					 *
					 * `TooltipTrigger` merender tombol, jadi ia terjangkau papan tik dan
					 * tooltipnya ikut terbuka saat difokus — bukan hover saja.
					 */}
					<Tooltip>
						<TooltipTrigger
							aria-label={`Apa yang diukur ${label}`}
							className="shrink-0 rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
						>
							<InfoIcon className="size-3.5" />
						</TooltipTrigger>
						<TooltipContent side="left" className="leading-relaxed">
							{diukur}
						</TooltipContent>
					</Tooltip>
				</p>

				<p className="shrink-0 text-sm font-semibold tabular-nums">
					{nilai.toFixed(2)}
				</p>
			</div>

			{/* Bilahnya sekadar `div`: satu bentuk sesederhana ini tidak memerlukan primitif sendiri. */}
			<div
				role="meter"
				aria-label={label}
				aria-valuenow={persen}
				aria-valuemin={0}
				aria-valuemax={100}
				className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
			>
				<div
					className="h-full rounded-full bg-primary"
					style={{ width: `${persen}%` }}
				/>
			</div>

			{/* Kotak alasan hanya tampil bila ada alasannya (skor RAGAS asli tidak membawa alasan per metrik). */}
			{alasan.trim() && (
				<div className="rounded-md bg-muted/60 p-2.5">
					{alasanLabel && (
						<p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							{alasanLabel}
						</p>
					)}
					<p className={cn('text-xs leading-relaxed', alasanLabel && 'mt-1')}>{alasan}</p>
				</div>
			)}
		</div>
	);
}
