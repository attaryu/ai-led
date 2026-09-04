import * as React from 'react';
import { ArrowRightIcon, CaretRightIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import { ScrollArea } from '~/core/components/ui/scroll-area';
import { Select } from '~/core/components/ui/select';
import { formatRelativeTime } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
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
import { ChapterEvidenceDetailSheet } from './chapter-evidence-detail-sheet';

/**
 * Isi tab "Bukti" — bukti dukung yang tercatat dipakai bab ini
 * (docs/application_flow.md §11.1) beserta kutipan yang diambil dari
 * masing-masing (§11.1a).
 *
 * Murni **read-only**: tidak ada satu pun aksi di sini, jadi tidak ada cabang
 * `izin.canEdit` sama sekali. §12.2 memang menuntut seluruh tab tetap terbaca
 * saat bab dikunci, dan di tab ini tidak ada yang bisa diubah siapa pun —
 * membuka laci kutipan pun tidak.
 *
 * Tiga hal yang berbeda dari tulisan §11.1, semuanya disengaja:
 *
 * - **Lingkupnya bisa dipilih.** §11.1 hanya menyebut `BUKTI_DUKUNG_BAB`
 *   (kondisi aktif), tapi tiap checkpoint menyimpan daftarnya sendiri yang
 *   permanen, dan §8.1 sudah menunda penampilannya ke tab ini. Membatasi diri ke
 *   kondisi aktif berarti arsip itu tidak pernah terlihat di mana pun.
 * - **Kutipannya ditampilkan.** §11.1 menulis tab ini "hanya menampilkan daftar,
 *   tanpa detail isi", dan itu ditulis saat belum ada apa pun untuk ditampilkan.
 *   Yang dibuka di sini bukan isi berkasnya, melainkan **bagian yang dipakai** —
 *   justru inti janji ketertelusuran `referensi_chunk_ids` (docs/database.md).
 *   Melihat berkas utuhnya tetap lewat Perpustakaan.
 * - **Bagian "Panduan" pindah ke tabnya sendiri** (§11.1b). §11.1 merancang
 *   keduanya sebagai dua bagian satu tab, dan itu ditulis saat bagian panduan
 *   belum punya apa pun untuk ditampilkan. Begitu tiap butirnya membawa kutipan
 *   sendiri, menumpuk keduanya di satu panel 320 px membuat hitungan di kepala
 *   tab ini berhenti berarti "berapa berkas". Kaki panel ini tidak lagi
 *   menjanjikannya menyusul — janjinya sudah ditepati di sebelah.
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

	/**
	 * Yang dipegang **id berkasnya, bukan barisnya** — mengikuti
	 * `led-project-assessment.tsx`. Barisnya dirakit ulang tiap `storage-update`
	 * (status berkas berubah, checkpoint lahir dari tab lain), jadi menyimpan
	 * objeknya berarti laci menampilkan salinan basi sampai ditutup.
	 *
	 * Ikut kosong sendiri saat lingkupnya diganti: id yang tidak ada di daftar
	 * baru membuat `barisDibuka` jadi `undefined`, dan laci menutup diri.
	 */
	const [dibukaId, setDibukaId] = React.useState<string | null>(null);

	const posisiDibuka = rujukan.findIndex((baris) => baris.ref.id === dibukaId);
	const barisDibuka = posisiDibuka === -1 ? null : rujukan[posisiDibuka];

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 space-y-2 px-5 pt-4 pb-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
					<p className="text-sm font-medium">Bukti Dukung</p>
					{/*
					 * Menghitung **berkas**, bukan kutipan. Total kutipan sengaja tidak
					 * ditampilkan: tab Kualitas AI sudah menyebut "N potongan sumber" dari
					 * `ragas.jumlahChunk`, dan angka ketiga di layar yang tidak bisa
					 * dicocokkan dengan keduanya cuma menimbulkan pertanyaan yang tidak
					 * ada jawabannya.
					 */}
					<span className="text-xs text-muted-foreground">
						{rujukan.length === 0
							? 'Belum ada bukti dukung'
							: `${rujukan.length} berkas`}
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
						aria-label="Lingkup bukti dukung"
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
									: 'Bukti dukung yang dipakai akan muncul di sini setelah bab ini digenerate atau ditulis.'}
						</p>
					) : (
						<ul className="space-y-0.5 pb-2">
							{rujukan.map((baris) => (
								<BarisBuktiRujukan
									key={baris.ref.id}
									baris={baris}
									terpilih={baris.ref.id === dibukaId}
									onBuka={() => setDibukaId(baris.ref.id)}
								/>
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
				 * Laci di sini memperlihatkan **bagian yang dipakai**, bukan berkasnya.
				 * Untuk membuka berkas utuhnya tetap ke Perpustakaan — dan seleksi di
				 * sana masih state lokal komponennya, jadi belum ada tautan langsung ke
				 * satu berkas.
				 */}
				<Link
					to={`/study-programs/${studyProgramId}/evidence`}
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Buka Perpustakaan
					<ArrowRightIcon className="size-4" />
				</Link>

			</div>

			<ChapterEvidenceDetailSheet
				baris={barisDibuka}
				posisi={posisiDibuka + 1}
				total={rujukan.length}
				onTutup={() => setDibukaId(null)}
				onPindah={(arah) => {
					const berikutnya = rujukan[posisiDibuka + arah];
					if (berikutnya) setDibukaId(berikutnya.ref.id);
				}}
			/>
		</div>
	);
}

/**
 * Satu bukti dukung di daftar.
 *
 * Baris yang berkasnya sudah dihapus **tetap ditampilkan**, memakai nama yang
 * dibekukan di `ref` saat catatannya dibuat. Menghilangkannya akan membuat
 * riwayat berbohong — bab itu memang pernah disusun dari berkas tersebut, dan
 * justru itu yang perlu diketahui saat dokumennya diperiksa. Kutipannya pun
 * tetap bisa dibuka: keduanya diturunkan dari `ref` yang sama, bukan dari berkas
 * hidupnya.
 *
 * Seluruh barisnya `<button>`, bukan sekadar caret di ujungnya — sasaran klik
 * selebar baris, mengikuti `assessment-result-row.tsx` dan alasan yang sama yang
 * membuat baris bukti dukung di tab Generasi dibungkus `<label>`.
 */
function BarisBuktiRujukan({
	baris,
	terpilih,
	onBuka,
}: {
	baris: BarisRujukan;
	/** Sedang dibuka di laci; barisnya ditandai supaya tempatnya tidak hilang. */
	terpilih: boolean;
	onBuka: () => void;
}) {
	const { ref, live, kutipan } = baris;
	const { Icon: FileTypeIcon, className: iconClassName } = getFileVisual(
		ref.tipeFile,
	);
	const hilang = live === undefined;

	return (
		<li>
			<button
				type="button"
				onClick={onBuka}
				aria-label={`Lihat ${kutipan.length} kutipan dari ${ref.namaDokumen}`}
				className={cn(
					'flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-muted/60',
					hilang && 'opacity-60',
					terpilih && 'bg-muted/60',
				)}
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
									{live.tipeFile.toUpperCase()} ·{' '}
									{formatBytes(live.ukuranBytes)} ·{' '}
									{formatRelativeTime(live.waktuDiunggah)}
								</span>
							</>
						)}
					</span>

					<span className="mt-1 block text-xs text-muted-foreground">
						{kutipan.length} kutipan dipakai
					</span>
				</span>

				<CaretRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			</button>
		</li>
	);
}
