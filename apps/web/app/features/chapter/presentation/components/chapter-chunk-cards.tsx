import * as React from 'react';

import { cn } from '~/core/lib/utils';
import { type PotonganSumber } from '../hooks/use-chapter-reference';

/** Panjang cuplikan sebelum "Selengkapnya" (karakter, setelah tag HTML dibuang). */
const CUPLIKAN_MAKS = 280;

/** Teks chunk bisa memuat tabel HTML hasil ekstraksi; untuk cuplikan cukup isinya, tanpa tag. */
function cuplikanBersih(teks: string): string {
	return teks
		.replace(/<\/(td|th)>/gi, ' | ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Daftar kartu chunk yang dipilih RAG untuk satu section: satu chunk = satu kartu.
 * Penanda jenis di kiri atas (LKPS / Dokumen), cuplikan isi, dan tombol
 * "Selengkapnya" untuk membuka isi chunk utuh seperti yang diterima LLM.
 */
export function ChapterChunkCards({ potongan }: { potongan: PotonganSumber[] }) {
	return (
		<ul className="space-y-2 pb-3">
			{potongan.map((p, i) => (
				<KartuChunk key={p.id} potongan={p} nomor={i + 1} />
			))}
		</ul>
	);
}

function KartuChunk({ potongan, nomor }: { potongan: PotonganSumber; nomor: number }) {
	const [terbuka, setTerbuka] = React.useState(false);
	const lkps = potongan.jenis === 'lkps';
	const bersih = React.useMemo(() => cuplikanBersih(potongan.teks), [potongan.teks]);
	const panjang = bersih.length > CUPLIKAN_MAKS || potongan.teks.length > CUPLIKAN_MAKS;

	return (
		<li className="rounded-md border border-border bg-background p-3">
			<div className="flex items-center justify-between gap-2">
				<span
					className={cn(
						'rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
						lkps
							? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
							: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
					)}
				>
					{lkps ? 'LKPS' : 'Dokumen'}
				</span>
				<span className="text-[10px] text-muted-foreground">#{nomor}</span>
			</div>

			<p className="mt-1.5 text-sm leading-snug font-medium break-words">{potongan.judul}</p>
			{potongan.bagian && (
				<p className="mt-0.5 line-clamp-2 text-xs leading-snug break-words text-muted-foreground">
					{potongan.bagian}
				</p>
			)}

			{terbuka ? (
				<p className="mt-2 max-h-72 overflow-auto rounded bg-muted/50 p-2 text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground/80">
					{potongan.teks}
				</p>
			) : (
				<p className="mt-2 text-xs leading-relaxed break-words text-muted-foreground">
					{panjang ? `${bersih.slice(0, CUPLIKAN_MAKS).trimEnd()}…` : bersih}
				</p>
			)}

			{panjang && (
				<button
					type="button"
					onClick={() => setTerbuka((v) => !v)}
					aria-expanded={terbuka}
					className="mt-1.5 cursor-pointer text-xs font-medium text-primary hover:underline"
				>
					{terbuka ? 'Lebih sedikit' : 'Selengkapnya'}
				</button>
			)}
		</li>
	);
}
