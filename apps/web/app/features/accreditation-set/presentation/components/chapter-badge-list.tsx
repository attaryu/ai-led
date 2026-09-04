import { CHAPTER_TEMPLATE } from '~/features/chapter/data/repositories/chapter.repository';
import { cn } from '~/core/lib/utils';

/**
 * Nomor bab yang dinilai satu kriteria, sebagai deretan lencana bernomor.
 *
 * Judul babnya masuk ke `title`, bukan ke lencananya: empat belas judul bab LED
 * panjang-panjang, dan menuliskannya utuh di dalam sel tabel akan menenggelamkan
 * kolom lain — sementara nomornya sendiri sudah cukup untuk membandingkan antar
 * baris. Yang dicocokkan nomor bab, bukan id bab, mengikuti `RUBRIK_KRITERIA_BAB`
 * (docs/database.md §11).
 */
export function ChapterBadgeList({
	urutanBab,
	className,
}: {
	urutanBab: number[];
	className?: string;
}) {
	if (urutanBab.length === 0) {
		return (
			<span className="text-sm text-muted-foreground">Belum ada bab</span>
		);
	}

	return (
		<div className={cn('flex flex-wrap gap-1', className)}>
			{[...urutanBab]
				.sort((a, b) => a - b)
				.map((urutan) => {
					const bab = CHAPTER_TEMPLATE.find((b) => b.chapterOrder === urutan);

					return (
						<span
							key={urutan}
							title={bab ? `Bab ${urutan} — ${bab.chapterTitle}` : `Bab ${urutan}`}
							className="inline-flex min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums"
						>
							{urutan}
						</span>
					);
				})}
		</div>
	);
}
