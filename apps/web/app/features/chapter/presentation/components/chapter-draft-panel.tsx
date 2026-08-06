import * as React from 'react';
import {
	ArrowCounterClockwiseIcon,
	CaretDownIcon,
	DotsThreeVerticalIcon,
	FloppyDiskIcon,
	SparkleIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button, buttonVariants } from '~/core/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/core/components/ui/dropdown-menu';
import { Input } from '~/core/components/ui/input';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import {
	labelDraft,
	type ChapterDraftEntity,
} from '../../domain/entities/chapter-draft.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { useChapterDraft, type HasilPulih } from '../hooks/use-chapter-draft';
import { type ChapterPermission } from '../hooks/use-chapter-permission';

/**
 * Isi tab "Draft" — riwayat checkpoint bab (docs/application_flow.md §8).
 *
 * Checkpoint adalah titik pulih permanen: dibuat sebelum perubahan besar, supaya
 * hasil sunting atau generate berikutnya yang ternyata kurang baik bisa
 * dibatalkan. Tiap baris menjawab tiga hal yang diminta §8.1 — **judul, siapa,
 * kapan**.
 *
 * Yang tidak ada di sini, dan itu disengaja:
 * - **Tombol hapus.** §8.1 melarangnya karena checkpoint adalah jejak audit
 *   akreditasi; `chapterDraftRepository` bahkan tidak punya methodnya.
 * - **Daftar bukti dukung tiap checkpoint.** Datanya tersimpan (itu inti
 *   `BUKTI_DUKUNG_DRAFT`), tapi yang menampilkannya nanti tab Rujukan — kolom
 *   selebar ini tidak cukup untuk riwayat sekaligus rinciannya.
 */
export function ChapterDraftPanel({
	chapter,
	izin,
	ambilSnapshot,
	onRestored,
}: {
	chapter: ChapterEntity;
	izin: ChapterPermission;
	ambilSnapshot: () => ChapterEntity | undefined;
	/** Dipanggil setelah pemulihan tersimpan; halaman editor yang mendorongnya ke Tiptap. */
	onRestored: (hasil: HasilPulih) => void;
}) {
	const {
		daftar,
		label,
		setLabel,
		sibuk,
		pesanGagal,
		bisaDisimpan,
		simpanCheckpoint,
		pulihkan,
	} = useChapterDraft({ chapter, izin, ambilSnapshot });

	/**
	 * Isian label tertutup secara bawaan dengan alasan yang sama seperti prompt di
	 * tab Generasi: ia opsional (§8.1), jadi membiarkannya terbuka berarti satu
	 * baris ruang hilang dari riwayat di tiap sesi, termasuk bagi yang tidak
	 * pernah mengisinya.
	 */
	const [labelTerbuka, setLabelTerbuka] = React.useState(false);

	function handlePulihkan(draft: ChapterDraftEntity) {
		const hasil = pulihkan(draft);
		if (hasil) onRestored(hasil);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 px-5 pt-4 pb-2">
				<p className="text-sm font-medium">Riwayat Draft</p>
				<span className="text-xs text-muted-foreground">
					{daftar.length === 0
						? 'Belum ada checkpoint'
						: `${daftar.length} checkpoint`}
				</span>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="px-5">
					{daftar.length === 0 ? (
						<p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
							{bisaDisimpan
								? 'Belum ada checkpoint tersimpan untuk bab ini. Simpan satu sebelum melakukan perubahan besar.'
								: 'Checkpoint pertama bisa dibuat setelah bab ini punya isi.'}
						</p>
					) : (
						<ul className="space-y-0.5 pb-2">
							{daftar.map((draft) => (
								<BarisDraft
									key={draft.id}
									draft={draft}
									sedangDipakai={chapter.checkpointAktifId === draft.id}
									bolehPulihkan={izin.canEdit && !sibuk}
									onPulihkan={() => handlePulihkan(draft)}
								/>
							))}
						</ul>
					)}
				</div>
			</ScrollArea>

			<div className="shrink-0 space-y-2 border-t border-border px-5 py-3">
				{/*
				 * §1: yang tidak boleh dipakai disembunyikan, bukan ditampilkan mati.
				 * Riwayat di atas tetap utuh karena §12.2 menuntut seluruh tab tetap
				 * terbaca saat bab dikunci.
				 */}
				{izin.canEdit ? (
					<>
						<div className="flex items-center justify-between gap-2">
							<button
								type="button"
								onClick={() => setLabelTerbuka((terbuka) => !terbuka)}
								disabled={sibuk}
								aria-expanded={labelTerbuka}
								aria-controls="label-draft"
								className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
							>
								<CaretDownIcon
									className={cn(
										'size-3 shrink-0 transition-transform',
										labelTerbuka && 'rotate-180',
									)}
								/>
								<span className="truncate">
									{/*
									 * Label yang sudah diketik lalu dilipat tetap ikut tersimpan.
									 * Tanpa penanda ini, tidak ada cara tahu checkpoint berikutnya
									 * masih akan memakai nama itu.
									 */}
									Beri label{!labelTerbuka && label.trim() && ' · terisi'}
								</span>
							</button>

							<Button
								type="button"
								size="sm"
								onClick={simpanCheckpoint}
								disabled={sibuk || !bisaDisimpan}
								className="shrink-0"
							>
								<FloppyDiskIcon />
								Simpan Draft
							</Button>
						</div>

						{/*
						 * Tetap terpasang saat dilipat, bukan dilepas dari pohon: tombol di
						 * atas menunjuknya lewat `aria-controls`, dan acuan ke elemen yang
						 * tidak ada membuat pola disclosure-nya tidak bisa diikuti pembaca
						 * layar.
						 */}
						<Input
							id="label-draft"
							hidden={!labelTerbuka}
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							disabled={sibuk}
							placeholder="Misal: sebelum revisi Penjamin Mutu"
							aria-label="Label checkpoint (opsional)"
							className="h-8 text-xs"
						/>

						{pesanGagal && (
							<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
								<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
								<p className="text-xs leading-relaxed text-destructive">
									{pesanGagal}
								</p>
							</div>
						)}
					</>
				) : (
					<p className="text-xs leading-relaxed text-muted-foreground">
						{izin.blockedReason === 'terkunci'
							? 'Bab ini dikunci Penjamin Mutu, jadi checkpoint tidak bisa dibuat atau dipulihkan.'
							: 'Anda hanya bisa membaca riwayat bab ini.'}
					</p>
				)}
			</div>
		</div>
	);
}

/**
 * Satu checkpoint di riwayat.
 *
 * Penanda `AI` hanya muncul untuk checkpoint bersumber AI; yang `MANUAL` dibiarkan
 * polos karena itu keadaan biasa, dan memberi lencana pada keduanya hanya menambah
 * derau di kolom sempit.
 */
function BarisDraft({
	draft,
	sedangDipakai,
	bolehPulihkan,
	onPulihkan,
}: {
	draft: ChapterDraftEntity;
	/** Checkpoint yang terakhir dipulihkan ke bab ini (`checkpointAktifId`). */
	sedangDipakai: boolean;
	bolehPulihkan: boolean;
	onPulihkan: () => void;
}) {
	return (
		<li className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted/60">
			<span className="min-w-0 flex-1">
				<span className="flex items-center gap-1.5">
					<span
						className="min-w-0 truncate text-sm leading-tight"
						title={labelDraft(draft)}
					>
						{labelDraft(draft)}
					</span>

					{draft.sumber === 'AI' && (
						<span
							title="Isinya dihasilkan AI"
							className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
						>
							<SparkleIcon className="size-2.5" />
							AI
						</span>
					)}
				</span>

				<span className="mt-1 block truncate text-xs text-muted-foreground">
					{draft.dibuatOlehNama} · {formatRelativeTimeLong(draft.dibuatPada)}
				</span>

				{/*
				 * Kalimat lampau, bukan pernyataan identitas.
				 *
				 * Versi sebelumnya berbunyi "Jadi basis isi bab sekarang", dan itu
				 * menyesatkan begitu penggunanya menyunting hasil pemulihan: isi bab
				 * langsung berbeda dari checkpoint ini, sementara kalimatnya masih
				 * terdengar mengaku sama — seolah suntingan berikutnya ikut masuk ke
				 * checkpoint. Tidak: checkpoint permanen, `chapterDraftRepository`
				 * bahkan tidak punya `update`, dan suntingan selalu jatuh ke
				 * `kontenKerja` bab aktif. Yang dicatat `checkpointAktifId` memang
				 * peristiwa, bukan keadaan, jadi kalimatnya ikut berbentuk peristiwa.
				 */}
				{sedangDipakai && (
					<span className="mt-1 block text-xs text-muted-foreground">
						Terakhir dipulihkan ke bab ini.
					</span>
				)}
			</span>

			{bolehPulihkan && (
				<DropdownMenu>
					<DropdownMenuTrigger
						aria-label={`Aksi untuk ${labelDraft(draft)}`}
						className={cn(
							buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
							'shrink-0 cursor-pointer',
						)}
					>
						<DotsThreeVerticalIcon className="size-4" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48 bg-popover">
						<DropdownMenuItem className="cursor-pointer" onClick={onPulihkan}>
							<ArrowCounterClockwiseIcon className="size-4" />
							Gunakan draft ini
						</DropdownMenuItem>
						{/*
						 * §8.1 juga menuntut "Lihat skor" di menu ini — modal berisi
						 * breakdown `HASIL_SKOR_KRITERIA` milik checkpoint. Belum bisa
						 * dibangun: tabel skornya dan tab Rubrik/Skor belum ada. Slotnya
						 * ditandai di sini, bukan dipasang sebagai item mati yang tidak
						 * menjelaskan apa pun.
						 */}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</li>
	);
}
