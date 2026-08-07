import * as React from 'react';
import {
	ClockIcon,
	LockSimpleIcon,
	LockSimpleOpenIcon,
	type Icon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { Textarea } from '~/core/components/ui/textarea';
import { formatRelativeTime } from '~/core/lib/format-time';
import {
	deriveChapterProgress,
	hasKonten,
	type ChapterEntity,
	type ChapterProgress,
} from '../../domain/entities/chapter.entity';
import { type ChapterPermission } from '../hooks/use-chapter-permission';
import { useChapterReview } from '../hooks/use-chapter-review';

/**
 * Rupa blok status di kepala panel, dibaca dari `deriveChapterProgress` supaya
 * ia dan badge di tabel Progres per Bab tidak pernah menyatakan hal berbeda
 * tentang bab yang sama. `SEDANG_DISUSUN` dan `BELUM_DIISI` sama-sama berarti
 * "belum ada yang mengantre", jadi keduanya memakai baris yang sama.
 */
const statusVisual: Record<
	ChapterProgress,
	{ icon: Icon; label: string; nada: string; keterangan: string }
> = {
	TERKUNCI: {
		icon: LockSimpleIcon,
		label: 'Dikunci untuk review',
		nada: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
		keterangan:
			'Selama terkunci, tidak seorang pun bisa mengubah isi bab ini — termasuk Penjamin Mutu yang menguncinya. Seluruh tab tetap bisa dibaca.',
	},
	MENUNGGU_REVIEW: {
		icon: ClockIcon,
		label: 'Menunggu review',
		nada: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
		keterangan:
			'Penyusun sudah menyatakan bab ini siap. Isinya beku bagi seluruh Penyusun sampai pengajuannya dibatalkan atau Penjamin Mutu merespons.',
	},
	SEDANG_DISUSUN: {
		icon: LockSimpleOpenIcon,
		label: 'Belum dikunci',
		nada: 'bg-muted text-muted-foreground',
		keterangan:
			'Penjamin Mutu belum mengunci bab ini, jadi isinya masih bisa dikerjakan sesuai hak masing-masing role.',
	},
	BELUM_DIISI: {
		icon: LockSimpleOpenIcon,
		label: 'Belum dikunci',
		nada: 'bg-muted text-muted-foreground',
		keterangan:
			'Penjamin Mutu belum mengunci bab ini, jadi isinya masih bisa dikerjakan sesuai hak masing-masing role.',
	},
};

/**
 * Isi tab "Review" — keadaan kunci bab dan catatan Penjamin Mutu (§12.2).
 *
 * Dibaca **semua role** yang boleh membuka babnya, bukan hanya Penjamin Mutu:
 * inilah satu-satunya tempat Penyusun bisa tahu kenapa babnya dikunci. Sebelum
 * tab ini ada, `catatanPenjaminMutu` cuma dipakai panel Perlu Perhatian untuk
 * menyalakan penanda "Ada catatan Penjamin Mutu" — badan catatannya sendiri
 * tidak pernah dirender di mana pun.
 *
 * Panel ini rumah **catatan**, bukan kuncinya: tombol Kunci/Buka Kunci berdiri
 * di header supaya tetap terjangkau dari tab mana pun.
 */
export function ChapterReviewPanel({
	chapter,
	izin,
	onReviewed,
}: {
	chapter: ChapterEntity;
	izin: ChapterPermission;
	onReviewed: (diperbarui: ChapterEntity) => void;
}) {
	const review = useChapterReview(chapter, izin, onReviewed);

	const tersimpan = chapter.catatanPenjaminMutu ?? '';
	/**
	 * Isi textarea, hanya dipakai Penjamin Mutu.
	 *
	 * Aman disemai sekali: `ChapterEditorWorkspace` di-`key` oleh `chapter.id`
	 * sehingga panel ini ikut terpasang ulang saat bab berganti, dan tidak ada
	 * jalur lain di halaman ini yang menulis `catatanPenjaminMutu`.
	 */
	const [draf, setDraf] = React.useState(tersimpan);

	// Menyimpan teks yang sama akan memundurkan `catatanPada` jadi "baru saja"
	// dan membuat atribusinya berbohong, jadi tombolnya mati sampai ada bedanya.
	const berubah = draf.trim() !== tersimpan.trim();

	const status = statusVisual[deriveChapterProgress(chapter)];
	const StatusIcon = status.icon;
	const diajukan = Boolean(chapter.diajukanReviewPada);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 space-y-3 px-5 pt-4 pb-3">
				{/*
				 * Warnanya mengikuti badge di tabel Progres Dokumen supaya keadaan yang
				 * sama tidak dibaca dua rupa di dua layar.
				 */}
				<div
					className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${status.nada}`}
				>
					<StatusIcon className="size-4 shrink-0" />
					<span className="font-medium">{status.label}</span>
					{diajukan && !chapter.terkunci && chapter.diajukanReviewPada && (
						<span className="ml-auto text-xs">
							{formatRelativeTime(chapter.diajukanReviewPada)}
						</span>
					)}
				</div>

				<p className="text-xs text-muted-foreground">{status.keterangan}</p>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-2 px-5 pb-4">
					<p className="text-sm font-medium">Catatan Penjamin Mutu</p>

					{review.boleh ? (
						<>
							<Textarea
								aria-label="Catatan Penjamin Mutu"
								value={draf}
								onChange={(event) => setDraf(event.currentTarget.value)}
								placeholder="Apa yang perlu diperbaiki Penyusun?"
								className="min-h-32 bg-card"
							/>
							{chapter.catatanOlehNama && (
								<p className="text-xs text-muted-foreground">
									{chapter.catatanOlehNama}
									{chapter.catatanPada &&
										` · ${formatRelativeTime(chapter.catatanPada)}`}
								</p>
							)}
							<p className="text-xs text-muted-foreground">
								Tampil di tab ini untuk semua orang yang membuka bab. Dikosongkan
								berarti catatannya dicabut.
							</p>
						</>
					) : chapter.catatanPenjaminMutu ? (
						<div className="space-y-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
							{/* `whitespace-pre-line` supaya catatan berparagraf tidak jadi satu blok. */}
							<p className="text-sm whitespace-pre-line">
								{chapter.catatanPenjaminMutu}
							</p>

							{/*
							 * Atribusi hanya dirender bila datanya ada: baris yang tersimpan
							 * sebelum kedua kolom ini lahir punya catatan tanpa penulis, dan
							 * mengarang "—" di situ lebih membingungkan daripada diam.
							 */}
							{chapter.catatanOlehNama && (
								<p className="text-xs text-muted-foreground">
									{chapter.catatanOlehNama}
									{chapter.catatanPada &&
										` · ${formatRelativeTime(chapter.catatanPada)}`}
								</p>
							)}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							Belum ada catatan dari Penjamin Mutu.
						</p>
					)}

					{review.pesanGagal && (
						<p className="text-sm text-destructive">{review.pesanGagal}</p>
					)}
				</div>
			</ScrollArea>

			{review.boleh && (
				<div className="flex shrink-0 justify-end border-t border-border px-5 py-3">
					<Button
						size="sm"
						className="cursor-pointer"
						disabled={!berubah}
						onClick={() => review.simpanCatatan(draf)}
					>
						Simpan Catatan
					</Button>
				</div>
			)}

			{/*
			 * Sisi Penyusun. `bolehMengajukan` sengaja bertahan melewati pembekuan —
			 * tombol batal justru harus ada persis saat babnya sudah beku.
			 */}
			{review.bolehMengajukan && (
				<div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
					{diajukan ? (
						<>
							<p className="text-xs text-muted-foreground">
								Batalkan kalau masih mau diubah.
							</p>
							<Button
								variant="outline"
								size="sm"
								className="cursor-pointer"
								onClick={() => review.ajukanReview(false)}
							>
								Batalkan Pengajuan
							</Button>
						</>
					) : (
						<>
							<p className="text-xs text-muted-foreground">
								{hasKonten(chapter)
									? 'Bab akan beku sampai Penjamin Mutu merespons.'
									: 'Bab kosong belum bisa diajukan.'}
							</p>
							<Button
								size="sm"
								className="cursor-pointer"
								disabled={!hasKonten(chapter)}
								onClick={() => review.ajukanReview(true)}
							>
								<ClockIcon className="size-4" />
								Ajukan Review
							</Button>
						</>
					)}
				</div>
			)}
		</div>
	);
}
