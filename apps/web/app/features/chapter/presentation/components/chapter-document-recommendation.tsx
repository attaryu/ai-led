import * as React from 'react';

import {
	ArrowClockwiseIcon,
	CheckCircleIcon,
	SparkleIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { type DocumentRecommendationEntity } from '../../domain/entities/document-recommendation.entity';
import { type StatusRekomendasi } from '../hooks/use-chapter-recommendation';

/**
 * Blok "Rekomendasikan Dokumen" di tab Generasi (port origin/led-wiriting
 * (dimas), flow persis dimas — bukan gerbang dua-langkah): sebelum menyusun
 * narasi, AI boleh disuruh menyarankan dokumen/folder bukti dukung yang
 * relevan buat bab ini. Konfirmasi TIDAK punya tombol sendiri — tombol
 * Generate di `chapter-generation-panel.tsx` yang mengonfirmasi lalu langsung
 * generate dalam satu klik, persis `confirmAndGenerate` milik dimas.
 *
 * **Bukan pengganti {@link ../components/chapter-evidence-suggestion.tsx
 * ChapterEvidenceSuggestion}.** Yang itu menjawab "apa yang belum diunggah",
 * murni pencocokan nama berkas, dan selalu nasihat. Yang ini menjawab "dari
 * yang **sudah** ada di pustaka, mana yang dipakai bab ini" lewat pencarian
 * semantik AI sungguhan.
 *
 * **Tidak membawa pemilih bukti dukung sendiri.** Daftarnya sudah ada tepat di
 * bawah blok ini — komentar `useChapterRecommendation` menjelaskan kenapa dua
 * kotak centang untuk berkas yang sama tidak pernah benar.
 */
export function ChapterDocumentRecommendation({
	judulSection,
	rekomendasi,
	status,
	pesanGagal,
	dimatikan,
	onTrigger,
}: {
	/** Section yang dibuka (rekomendasi per section, dimas); `null` = belum ada yang dibuka. */
	judulSection: string | null;
	rekomendasi: DocumentRecommendationEntity | null;
	status: StatusRekomendasi;
	pesanGagal: string | null;
	/** `true` selagi generate berjalan; seluruh blok dibekukan. */
	dimatikan: boolean;
	onTrigger: () => void;
}) {
	if (judulSection === null) {
		return (
			<p className="mb-2 rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
				Buka satu section di outline untuk meminta rekomendasi dokumen section itu.
			</p>
		);
	}

	if (status === 'berjalan') {
		return (
			<div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
				<SpinnerGapIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
				<p className="text-xs text-muted-foreground">
					Mencari dokumen yang relevan untuk {judulSection}…
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
					Biarkan AI menyarankan dokumen yang relevan sebelum menyusun {judulSection}.
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
	// Feedback dimas: setelah generate, yang DIGUNAKAN hilang dari daftar (TIDAK_DIPERLUKAN juga) --
	// yang tersisa cuma yang belum terpenuhi. Barisnya tetap di DB sebagai jejak cross-check.
	const sisanya = rekomendasi.items.filter((item) => item.status === 'DIREKOMENDASIKAN');

	return (
		<div className="mb-2 rounded-md border border-border bg-muted/40 p-2.5">
			<div className="flex items-center justify-between gap-2">
				<p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					<SparkleIcon className="size-3.5" />
					Rekomendasi Dokumen AI
				</p>

				<div className="flex shrink-0 items-center gap-2">
					{sudahDikonfirmasi && (
						<span className="flex items-center gap-1 text-xs font-medium text-foreground">
							<CheckCircleIcon weight="fill" className="size-3.5 text-primary" />
							Dikonfirmasi
						</span>
					)}
					<Button
						type="button"
						size="xs"
						variant="ghost"
						onClick={onTrigger}
						disabled={dimatikan}
						className="cursor-pointer text-muted-foreground hover:text-foreground"
					>
						<ArrowClockwiseIcon />
						Rekomendasikan ulang
					</Button>
				</div>
			</div>

			{/*
			 * ponytail: HANYA nama dokumen. Narasi pembuka (`recommendationText`)
			 * dan alasan per item (`item.reason`) sengaja tidak dirender -- yang
			 * dibutuhkan penyusun cuma "dokumen apa saja", sementara kalimat
			 * LLM-nya memanjangkan kartu tanpa menambah keputusan apa pun.
			 * Keduanya tetap disimpan di DB sebagai jejak alasan AI.
			 *
			 * Digulung dalam tinggi tetap supaya daftar bukti dukung di bawahnya
			 * tidak terdesak.
			 */}
			{sisanya.length > 0 && (
				<ScrollArea className="mt-1.5 h-48">
					<div className="pr-2.5">
						<ul className="space-y-1.5">
							{sisanya.map((item) => (
								<li key={item.id} className="rounded-md border border-border bg-background p-2">
									<p className="text-sm leading-tight font-medium">{item.label}</p>
								</li>
							))}
						</ul>
					</div>
				</ScrollArea>
			)}

			{sudahDikonfirmasi ? (
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					Generate akan memakai bukti dukung yang sudah dikonfirmasi ini sebagai
					konteks.
				</p>
			) : (
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					Centang bukti dukung yang sesuai di daftar bawah, lalu klik Generate —
					pilihan itu ikut terkonfirmasi otomatis.
				</p>
			)}
		</div>
	);
}
