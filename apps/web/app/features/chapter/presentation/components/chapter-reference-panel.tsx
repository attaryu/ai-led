import { ArrowRightIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { Select } from '~/core/components/ui/select';
import { formatRelativeTime } from '~/core/lib/format-time';
import { EvidenceStatusBadge } from '~/features/evidence/presentation/components/evidence-status-badge';
import {
	formatBytes,
	getFileVisual,
} from '~/features/evidence/presentation/utils/evidence-format';
import {
	hasKonten,
	type ChapterEntity,
} from '../../domain/entities/chapter.entity';
import { labelDraft } from '../../domain/entities/chapter-draft.entity';
import {
	useChapterReference,
	type BarisRujukan,
} from '../hooks/use-chapter-reference';

/**
 * Isi tab "Rujukan" — bukti dukung yang tercatat dipakai bab ini
 * (docs/application_flow.md §11.1).
 *
 * Murni **read-only**: tidak ada satu pun aksi di sini, jadi tidak ada cabang
 * `izin.canEdit` sama sekali. §12.2 memang menuntut seluruh tab tetap terbaca
 * saat bab dikunci, dan di tab ini tidak ada yang bisa diubah siapa pun.
 *
 * Dua hal yang berbeda dari tulisan §11.1, keduanya disengaja:
 *
 * - **Lingkupnya bisa dipilih.** §11.1 hanya menyebut `BUKTI_DUKUNG_BAB`
 *   (kondisi aktif), tapi tiap checkpoint menyimpan daftarnya sendiri yang
 *   permanen, dan §8.1 sudah menunda penampilannya ke tab ini. Membatasi diri ke
 *   kondisi aktif berarti arsip itu tidak pernah terlihat di mana pun.
 * - **Bagian "Panduan" belum ada.** `PANDUAN_REFERENSI`/`PANDUAN_DETAIL` belum
 *   dibangun, dan `referensiChunkIds` yang tersimpan masih string tiruan tanpa
 *   entitas di baliknya. Ketiadaannya dinyatakan di kaki panel, bukan didiamkan.
 */
export function ChapterReferencePanel({
	chapter,
	studyProgramId,
}: {
	chapter: ChapterEntity;
	studyProgramId: string;
}) {
	const { daftarDraft, lingkup, setLingkup, rujukan, jumlahHilang } =
		useChapterReference({ chapter, studyProgramId });

	const punyaRiwayat = daftarDraft.length > 0;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 space-y-2 px-5 pt-4 pb-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
					<p className="text-sm font-medium">Bukti Dukung</p>
					<span className="text-xs text-muted-foreground">
						{rujukan.length === 0
							? 'Belum ada rujukan'
							: `${rujukan.length} rujukan`}
					</span>
				</div>

				{/*
				 * Pemilih hanya muncul bila babnya memang punya riwayat. Untuk bab yang
				 * belum pernah di-checkpoint, kontrol berisi satu pilihan cuma derau.
				 */}
				{punyaRiwayat && (
					<Select
						value={lingkup}
						onChange={(event) => setLingkup(event.target.value)}
						aria-label="Lingkup rujukan"
						className="h-8 text-xs"
					>
						<option value="aktif">Kondisi aktif</option>
						{daftarDraft.map((draft) => (
							<option key={draft.id} value={draft.id}>
								{/*
								 * Nomor versinya baru ditambahkan kalau checkpointnya memang
								 * berlabel — `labelDraft` sendiri sudah jatuh ke "Versi N"
								 * untuk yang tanpa nama, dan menempelkan keduanya menghasilkan
								 * "Versi 2 — Versi 2".
								 */}
								{draft.label
									? `Versi ${draft.versi} — ${draft.label}`
									: labelDraft(draft)}
							</option>
						))}
					</Select>
				)}
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="px-5">
					{rujukan.length === 0 ? (
						<p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
							{lingkup !== 'aktif'
								? 'Checkpoint ini tidak mencatat bukti dukung apa pun.'
								: hasKonten(chapter)
									? 'Belum ada bukti dukung yang tercatat dipakai bab ini.'
									: 'Panduan dan bukti dukung yang dipakai akan muncul di sini setelah bab ini digenerate atau ditulis.'}
						</p>
					) : (
						<ul className="space-y-0.5 pb-2">
							{rujukan.map((baris) => (
								<BarisBuktiRujukan key={baris.ref.id} baris={baris} />
							))}
						</ul>
					)}
				</div>
			</ScrollArea>

			<div className="shrink-0 space-y-2 border-t border-border px-5 py-3">
				{jumlahHilang > 0 && (
					<p className="text-xs leading-relaxed text-muted-foreground">
						{jumlahHilang} berkas sudah dihapus dari Perpustakaan. Namanya tetap
						tercatat sebagai jejak.
					</p>
				)}

				{/*
				 * §11.1: tab ini hanya menampilkan daftar; detail dibuka di
				 * Perpustakaan. Yang bisa ditawarkan hanya membuka pustakanya —
				 * seleksi berkas di sana masih state lokal, jadi belum ada tautan
				 * langsung ke satu berkas.
				 */}
				<Link
					to={`/study-programs/${studyProgramId}/evidence`}
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Buka Perpustakaan
					<ArrowRightIcon className="size-4" />
				</Link>

				<p className="text-xs leading-relaxed text-muted-foreground">
					Bagian panduan LAM Teknik menyusul setelah dokumen panduan dan
					pencarian rujukannya tersedia.
				</p>
			</div>
		</div>
	);
}

/**
 * Satu bukti dukung di daftar rujukan.
 *
 * Baris yang berkasnya sudah dihapus **tetap ditampilkan**, memakai nama yang
 * dibekukan di `ref` saat rujukannya dibuat. Menghilangkannya akan membuat
 * riwayat berbohong — bab itu memang pernah disusun dari berkas tersebut, dan
 * justru itu yang perlu diketahui saat dokumennya diperiksa.
 */
function BarisBuktiRujukan({ baris }: { baris: BarisRujukan }) {
	const { ref, live } = baris;
	const { Icon: FileTypeIcon, className: iconClassName } = getFileVisual(
		ref.tipeFile,
	);
	const hilang = live === undefined;

	return (
		<li
			className={
				hilang
					? 'flex items-start gap-2.5 rounded-md px-2 py-2 opacity-60'
					: 'flex items-start gap-2.5 rounded-md px-2 py-2'
			}
		>
			<FileTypeIcon
				weight="fill"
				className={`mt-0.5 size-5 shrink-0 ${iconClassName}`}
			/>

			<span className="min-w-0 flex-1">
				<span
					className="block truncate text-sm leading-tight"
					title={ref.namaDokumen}
				>
					{ref.namaDokumen}
				</span>

				<span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
					{hilang ? (
						<>
							<span className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
								Sudah dihapus
							</span>
							<span className="text-xs text-muted-foreground">
								Tercatat sebagai {ref.tipeFile.toUpperCase()}
							</span>
						</>
					) : (
						<>
							<EvidenceStatusBadge status={live.status} />
							<span className="text-xs text-muted-foreground">
								{live.tipeFile.toUpperCase()} · {formatBytes(live.ukuranBytes)} ·{' '}
								{formatRelativeTime(live.waktuDiunggah)}
							</span>
						</>
					)}
				</span>
			</span>
		</li>
	);
}
