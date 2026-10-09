import { ListChecksIcon } from '@phosphor-icons/react';
import * as React from 'react';

import { cn } from '~/core/lib/utils';

/** Butir yang langsung tampil; sisanya di balik "Lihat semua". */
const RINGKAS = 4;

/**
 * Hasil tahap checklist (`_SYSTEM_CHECKLIST`) sebagai alur bernomor: butir fakta yang dicari
 * retrieval untuk generate terakhir section ini. Tiap butir punya lencana nomor dan garis
 * penghubung, supaya terbaca sebagai langkah pencarian, bukan teks datar.
 */
export function ChapterChecklistTimeline({
	checklist,
	galat,
}: {
	checklist: string[];
	/** Terisi bila tahap checklist gagal 2x -- section digenerate tanpa panduan pencarian fakta. */
	galat: string | null;
}) {
	const [semua, setSemua] = React.useState(false);
	const tampil = semua ? checklist : checklist.slice(0, RINGKAS);
	const tersembunyi = checklist.length - tampil.length;

	return (
		<section className="mt-5 rounded-xl border border-border bg-card p-3.5">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
						<ListChecksIcon className="size-4" weight="bold" />
					</span>
					<h3 className="text-xs font-semibold">Checklist pencarian fakta</h3>
				</div>
				{checklist.length > 0 && (
					<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
						{checklist.length} butir
					</span>
				)}
			</div>
			<p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
				Hal-hal yang dicari AI di bukti dukung dan LKPS sebelum menulis section ini.
			</p>

			{checklist.length > 0 ? (
				<>
					<ol className="mt-3">
						{tampil.map((butir, i) => {
							const terakhir = i === tampil.length - 1;
							return (
								<li key={i} className="relative flex gap-2.5 pb-3 last:pb-0">
									{!terakhir && (
										<span
											aria-hidden
											className="absolute top-6 bottom-0 left-3 w-px -translate-x-1/2 bg-border"
										/>
									)}
									<span className="z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary tabular-nums ring-4 ring-card">
										{i + 1}
									</span>
									<p className="pt-0.5 text-xs leading-relaxed text-foreground/90">{butir}</p>
								</li>
							);
						})}
					</ol>
					{checklist.length > RINGKAS && (
						<button
							type="button"
							onClick={() => setSemua((v) => !v)}
							aria-expanded={semua}
							className={cn(
								'mt-2.5 w-full cursor-pointer rounded-md bg-muted/60 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
							)}
						>
							{semua ? 'Ringkas' : `Lihat semua (${tersembunyi} lagi)`}
						</button>
					)}
				</>
			) : (
				<p className="mt-3 rounded-md bg-muted/60 p-2.5 text-xs leading-relaxed text-muted-foreground">
					{galat
						? `Tahap checklist gagal, section ini digenerate tanpa panduan pencarian fakta: ${galat}`
						: 'Tidak ada butir checklist yang tercatat untuk generate ini.'}
				</p>
			)}
		</section>
	);
}
