import * as React from 'react';
import {
	TrashIcon,
	CaretDownIcon,
	FloppyDiskIcon,
	SparkleIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { EditorContent, useEditor } from '@tiptap/react';

import { Button } from '~/core/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import { useConfirmDialog } from '~/core/components/ui/confirm-dialog';
import { Input } from '~/core/components/ui/input';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import {
	labelSectionDraft,
	type SectionDraftEntity,
} from '../../domain/entities/section-draft.entity';
import { type ChapterSectionEntity } from '../../domain/entities/chapter-section.entity';
import { editorExtensions } from '../utils/editor-extensions';
import { useSectionDraft, type HasilPulihSection } from '../hooks/use-section-draft';
import {
	frasaBlokir,
	type ChapterPermission,
} from '../hooks/use-chapter-permission';

/**
 * Isi tab "Draft" saat sebuah section terbuka — riwayat checkpoint SECTION
 * ini (bukan bab utuh, lihat `use-section-draft.ts`).
 *
 * Sama seperti tab Chat/Panduan: kalau belum ada section dipilih (tampilan
 * bab-penuh), panel ini menampilkan ajakan membuka satu section dulu,
 * bukan riwayat kosong yang membingungkan.
 */
export function SectionDraftPanel({
	chapterId,
	section,
	izin,
	ambilSnapshot,
	onRestored,
}: {
	chapterId: string;
	section: ChapterSectionEntity | null;
	izin: ChapterPermission;
	ambilSnapshot: () => Promise<ChapterSectionEntity | undefined>;
	onRestored: (hasil: HasilPulihSection) => void;
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
		hapus,
	} = useSectionDraft({
		chapterId,
		sectionId: section?.id ?? null,
		izin,
		ambilSnapshot,
	});
	const { konfirmasi, confirmDialog } = useConfirmDialog();

	const [labelTerbuka, setLabelTerbuka] = React.useState(false);
	/** dimas "Melihat versi lama": versi yang sedang dipratinjau baca-saja. */
	const [dilihat, setDilihat] = React.useState<SectionDraftEntity | null>(null);

	/**
	 * Pilih draft -> narasinya yang tampil di kanvas. TANPA dialog konfirmasi:
	 * draft di sini bukan "checkpoint yang dipulihkan" lagi melainkan daftar
	 * versi yang berdiri sendiri, jadi berpindah antar-draft harus semurah
	 * berpindah tab. Tulisan yang sedang di kanvas sudah tersimpan ke draft
	 * aktifnya sendiri lewat autosave, jadi tidak ada yang hilang.
	 */
	async function handlePilih(draft: SectionDraftEntity) {
		if (draft.aktif) return;

		const hasil = await pulihkan(draft);
		if (hasil) {
			onRestored(hasil);
			setDilihat(null);
		}
	}

	async function handleHapus(draft: SectionDraftEntity) {
		const lanjut = await konfirmasi({
			judul: `Hapus "${labelSectionDraft(draft)}"?`,
			// Dikatakan eksplisit: yang hilang cuma arsipnya. Tanpa kalimat ini
			// penyusun wajar mengira tulisan section-nya ikut terhapus.
			// Draft = narasinya. Menghapus yang sedang tampil berarti kanvas ikut
			// berganti (ke versi tersisa) atau kosong kalau ini draft terakhir.
			deskripsi: !draft.aktif
				? 'Versi ini dibuang dari daftar. Tulisan yang sedang tampil di kanvas tidak terpengaruh. Tidak bisa dibatalkan.'
				: daftar.length > 1
					? 'Draft ini sedang tampil di kanvas. Setelah dihapus, kanvas berpindah ke versi tersisa yang terbaru. Tidak bisa dibatalkan.'
					: 'Ini satu-satunya draft dan sedang tampil di kanvas. Menghapusnya MENGOSONGKAN tulisan section ini. Tidak bisa dibatalkan.',
			labelAksi: 'Hapus',
			merusak: true,
		});
		if (!lanjut) return;

		const hasil = await hapus(draft);
		if (!hasil) return;
		// Kanvas disegarkan dari isi section SESUDAH hapus: pindah ke versi
		// tersisa, atau kosong kalau draft terakhir. Tanpa ini tulisannya tetap
		// terlihat sampai halaman dimuat ulang manual.
		onRestored(hasil);
		// Dialog pratinjau yang sedang menampilkan versi ini jadi yatim -- tutup.
		if (dilihat?.id === draft.id) setDilihat(null);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 px-5 pt-4 pb-2">
				<p className="text-sm font-medium">Riwayat Draft</p>
				{section && (
					<span className="text-xs text-muted-foreground">
						{daftar.length === 0
							? 'Belum ada checkpoint'
							: `${daftar.length} checkpoint`}
					</span>
				)}
			</div>

			{!section ? (
				<p className="px-5 py-8 text-center text-xs leading-relaxed text-muted-foreground">
					Buka salah satu section untuk melihat dan menyimpan checkpoint.
				</p>
			) : (
				<>
					<ScrollArea className="min-h-0 flex-1">
						<div className="px-5">
							{daftar.length === 0 ? (
								<p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
									{bisaDisimpan
										? 'Belum ada checkpoint tersimpan untuk section ini. Simpan satu sebelum melakukan perubahan besar.'
										: 'Checkpoint pertama bisa dibuat setelah section ini punya isi.'}
								</p>
							) : (
								<ul className="space-y-0.5 pb-2">
									{daftar.map((draft) => (
										<BarisDraft
											key={draft.id}
											draft={draft}
											aktif={draft.aktif}
											bolehPilih={izin.canEdit && !sibuk}
											onPilih={() => void handlePilih(draft)}
											onHapus={() => handleHapus(draft)}
											onLihat={() => setDilihat(draft)}
										/>
									))}
								</ul>
							)}
						</div>
					</ScrollArea>

					<div className="shrink-0 space-y-2 border-t border-border px-5 py-3">
						{izin.canEdit ? (
							<>
								<div className="flex items-center justify-between gap-2">
									<button
										type="button"
										onClick={() => setLabelTerbuka((terbuka) => !terbuka)}
										disabled={sibuk}
										aria-expanded={labelTerbuka}
										aria-controls="label-section-draft"
										className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
									>
										<CaretDownIcon
											className={cn(
												'size-3 shrink-0 transition-transform',
												labelTerbuka && 'rotate-180',
											)}
										/>
										<span className="truncate">
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

								<Input
									id="label-section-draft"
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
								{izin.blockedReason === 'terkunci' ||
								izin.blockedReason === 'diajukan'
									? `Draft tidak bisa dibuat atau dipilih. ${frasaBlokir[izin.blockedReason]}.`
									: 'Anda hanya bisa membaca riwayat section ini.'}
							</p>
						)}
					</div>
				</>
			)}

			<Dialog open={dilihat !== null} onOpenChange={(buka) => !buka && setDilihat(null)}>
				<DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{dilihat && labelSectionDraft(dilihat)}
							<span className="ml-2 text-xs font-normal text-muted-foreground">
								Melihat versi lama · baca saja
							</span>
						</DialogTitle>
					</DialogHeader>
					{dilihat && <PratinjauDraft html={dilihat.konten ?? ''} />}
					{dilihat && izin.canEdit && !dilihat.aktif && (
						<DialogFooter>
							<Button type="button" disabled={sibuk} onClick={() => void handlePilih(dilihat)}>
								Jadikan Draft Aktif
							</Button>
						</DialogFooter>
					)}
				</DialogContent>
			</Dialog>

			{confirmDialog}
		</div>
	);
}

/** Isi versi lama, dirender Tiptap read-only dengan ekstensi yang sama dengan editor. */
function PratinjauDraft({ html }: { html: string }) {
	const editor = useEditor(
		{ extensions: editorExtensions, content: html, editable: false, immediatelyRender: false },
		[html],
	);
	if (!html.trim()) {
		return <p className="text-sm text-muted-foreground">Versi ini kosong.</p>;
	}
	return <EditorContent editor={editor} className="tiptap" />;
}

function BarisDraft({
	draft,
	aktif,
	bolehPilih,
	onPilih,
	onHapus,
	onLihat,
}: {
	draft: SectionDraftEntity;
	aktif: boolean;
	/** Butuh hak ubah dan panel tidak sedang sibuk -- menjaga pilih maupun hapus. */
	bolehPilih: boolean;
	onPilih: () => void;
	onHapus: () => void;
	onLihat: () => void;
}) {
	return (
		<li
			className={`flex items-start gap-2 rounded-md px-2 py-2 ${
				aktif ? 'bg-primary/5 ring-1 ring-primary/25' : 'hover:bg-muted/60'
			}`}
		>
			{/* Klik baris = jadikan draft ini yang tampil di kanvas. Tanpa hak ubah
			    (atau untuk draft yang memang sudah aktif) ia jatuh ke pratinjau
			    baca-saja, bukan tombol mati yang membingungkan. */}
			<button
				type="button"
				onClick={bolehPilih && !aktif ? onPilih : onLihat}
				aria-label={
					bolehPilih && !aktif
						? `Tampilkan ${labelSectionDraft(draft)} di kanvas`
						: `Lihat ${labelSectionDraft(draft)}`
				}
				className="min-w-0 flex-1 cursor-pointer text-left"
			>
				<span className="flex items-center gap-1.5">
					<span
						className="min-w-0 truncate text-sm leading-tight"
						title={labelSectionDraft(draft)}
					>
						{labelSectionDraft(draft)}
					</span>

					{aktif && (
						<span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
							Aktif
						</span>
					)}
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
			</button>

			{bolehPilih && (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`Hapus ${labelSectionDraft(draft)}`}
					onClick={onHapus}
					className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
				>
					<TrashIcon className="size-4" />
				</Button>
			)}
		</li>
	);
}
