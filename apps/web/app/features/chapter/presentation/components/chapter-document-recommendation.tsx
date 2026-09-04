import {
	CheckCircleIcon,
	CheckIcon,
	SparkleIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { type DocumentRecommendationEntity } from '../../domain/entities/document-recommendation.entity';
import { type StatusRekomendasi } from '../hooks/use-chapter-recommendation';

/**
 * Blok "Rekomendasikan Dokumen -> Konfirmasi" di tab Generasi (port
 * origin/led-wiriting(dimas)): sebelum menyusun narasi, AI boleh disuruh
 * menyarankan dokumen/folder bukti dukung yang relevan buat bab ini.
 *
 * **Bukan pengganti {@link ../components/chapter-evidence-suggestion.tsx
 * ChapterEvidenceSuggestion}.** Yang itu menjawab "apa yang belum diunggah",
 * murni pencocokan nama berkas, dan selalu nasihat — tidak pernah menghalangi
 * Generate. Yang ini menjawab "dari yang **sudah** ada di pustaka, mana yang
 * dipakai bab ini" lewat pencarian semantik AI sungguhan, dan begitu dipicu ia
 * jadi gerbang: Generate menunggu sampai pilihannya dikonfirmasi (lihat
 * gerbang di `chapter-generation-panel.tsx`).
 *
 * **Tidak membawa pemilih bukti dukung sendiri.** Daftarnya sudah ada tepat di
 * bawah blok ini — komentar `useChapterRecommendation` menjelaskan kenapa dua
 * kotak centang untuk berkas yang sama tidak pernah benar. `jumlahDipilih`
 * cuma melaporkan angkanya; centangnya sendiri terjadi di baris bukti dukung
 * yang sudah ada.
 */
export function ChapterDocumentRecommendation({
	rekomendasi,
	status,
	pesanGagal,
	jumlahDipilih,
	dimatikan,
	onTrigger,
	onKonfirmasi,
}: {
	rekomendasi: DocumentRecommendationEntity | null;
	status: StatusRekomendasi;
	pesanGagal: string | null;
	/** Jumlah bukti dukung yang sedang tercentang di daftar di bawah blok ini. */
	jumlahDipilih: number;
	/** `true` selagi generate berjalan; seluruh blok dibekukan. */
	dimatikan: boolean;
	onTrigger: () => void;
	onKonfirmasi: () => void;
}) {
	if (status === 'berjalan') {
		return (
			<div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
				<SpinnerGapIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
				<p className="text-xs text-muted-foreground">
					Mencari dokumen yang relevan untuk bab ini…
				</p>
			</div>
		);
	}

	if (status === 'gagal') {
		return (
			<div className="mb-2 flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
				<p className="flex items-start gap-2 text-xs leading-relaxed text-destructive">
					<WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
					{pesanGagal}
				</p>
				<Button
					type="button"
					size="xs"
					variant="outline"
					onClick={onTrigger}
					disabled={dimatikan}
					className="shrink-0 cursor-pointer"
				>
					Coba lagi
				</Button>
			</div>
		);
	}

	if (!rekomendasi) {
		return (
			<div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2">
				<p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
					Biarkan AI menyarankan dokumen yang relevan sebelum menyusun bab ini.
				</p>
				<Button
					type="button"
					size="xs"
					variant="outline"
					onClick={onTrigger}
					disabled={dimatikan}
					className="shrink-0 cursor-pointer"
				>
					<SparkleIcon />
					Rekomendasikan
				</Button>
			</div>
		);
	}

	const sudahDikonfirmasi = rekomendasi.status === 'DIKONFIRMASI';

	return (
		<div className="mb-2 rounded-md border border-border bg-muted/40 p-2.5">
			<div className="flex items-baseline justify-between gap-2">
				<p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					<SparkleIcon className="size-3.5" />
					Rekomendasi Dokumen AI
				</p>

				{sudahDikonfirmasi && (
					<span className="flex shrink-0 items-center gap-1 text-xs font-medium text-foreground">
						<CheckCircleIcon weight="fill" className="size-3.5 text-primary" />
						Dikonfirmasi
					</span>
				)}
			</div>

			{/*
			 * Teks DAN kartu digulung BERSAMA, dibatasi tinggi total-nya di sini —
			 * bukan cuma daftar kartunya. recommendationText sendirian bisa
			 * beberapa baris, dan menaruhnya di luar batas membuat tinggi blok ini
			 * tetap tak terduga (paragraf panjang + tinggi maksimal kartu bisa
			 * gabungannya lebih tinggi dari seluruh panel), sehingga daftar bukti
			 * dukung di chapter-generation-panel.tsx ikut terdesak nyaris nol
			 * tinggi dan footer-nya sendiri meluber keluar batas overflow-hidden
			 * panel — bukan cuma "tidak bisa digulung", tapi kartu paling bawah
			 * ikut terpotong/tertimpa baris tombol Konfirmasi/Generate di
			 * bawahnya. Satu ScrollArea dengan batas tetap membuat tinggi total
			 * blok ini — dan sisa ruang untuk daftar bukti dukung — bisa diduga.
			 */}
			{(rekomendasi.recommendationText || rekomendasi.items.length > 0) && (
				<ScrollArea className="mt-1.5 h-48">
					<div className="pr-2.5">
						{rekomendasi.recommendationText && (
							<p className="text-xs leading-relaxed text-muted-foreground">
								{rekomendasi.recommendationText}
							</p>
						)}

						{rekomendasi.items.length > 0 && (
							<ul
								className={
									rekomendasi.recommendationText
										? 'mt-2 space-y-1.5'
										: 'space-y-1.5'
								}
							>
								{rekomendasi.items.map((item) => (
									<li
										key={item.id}
										className="rounded-md border border-border bg-background p-2"
									>
										<div className="flex items-baseline justify-between gap-2">
											<p
												className={
													item.status === 'TIDAK_DIPERLUKAN'
														? 'text-sm leading-tight font-medium text-muted-foreground line-through'
														: 'text-sm leading-tight font-medium'
												}
											>
												{item.label}
											</p>
											{item.status === 'DIGUNAKAN' && (
												<span className="shrink-0 text-[10px] font-medium text-primary">
													Digunakan
												</span>
											)}
											{item.status === 'TIDAK_DIPERLUKAN' && (
												<span className="shrink-0 text-[10px] font-medium text-muted-foreground">
													Tidak diperlukan
												</span>
											)}
										</div>
										{item.reason && (
											<p className="mt-0.5 text-xs text-muted-foreground">
												{item.reason}
											</p>
										)}
									</li>
								))}
							</ul>
						)}
					</div>
				</ScrollArea>
			)}

			{sudahDikonfirmasi ? (
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					Generate akan memakai bukti dukung yang sudah dikonfirmasi ini sebagai
					konteks.
				</p>
			) : (
				<>
					<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
						Centang bukti dukung yang sesuai di daftar bawah, lalu konfirmasi
						supaya Generate memakai pilihan ini.
					</p>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onKonfirmasi}
						disabled={dimatikan || jumlahDipilih === 0}
						className="mt-2 w-full cursor-pointer"
					>
						<CheckIcon />
						Konfirmasi{jumlahDipilih > 0 && ` ${jumlahDipilih} bukti`}
					</Button>
				</>
			)}
		</div>
	);
}
