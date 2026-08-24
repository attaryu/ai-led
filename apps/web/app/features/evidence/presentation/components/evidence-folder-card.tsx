import {
	ArrowsOutCardinalIcon,
	DotsThreeVerticalIcon,
	FolderIcon,
	PencilSimpleIcon,
	TrashIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { buttonVariants } from '~/core/components/ui/button';
import { Checkbox } from '~/core/components/ui/checkbox';
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '~/core/components/ui/dropdown-menu';
import { cn } from '~/core/lib/utils';
import { type EvidenceFolderEntity } from '../../domain/entities/evidence-folder.entity';

/**
 * Satu folder dalam tampilan kartu, bersanding dengan kartu berkas
 * (docs/application_flow.md §4.6a).
 *
 * Bentuknya sengaja menyalin `EvidenceCard` — bingkai, sudut, dan tinggi yang
 * sama — supaya deretan campuran folder dan berkas terbaca sebagai satu daftar,
 * bukan dua daftar yang kebetulan bertetangga. Yang membedakan cuma ikonnya dan
 * baris keterangannya.
 *
 * **Jumlah berkasnya rekursif**, mencakup seluruh keturunan. Folder yang isinya
 * hanya subfolder akan berbunyi "0 berkas" kalau yang dihitung anak langsung —
 * terbaca kosong padahal memuat puluhan.
 *
 * **Penanda "perlu perhatian" ada karena folder menyembunyikan kegagalan.**
 * Seluruh guna kolom status adalah menjawab "bukti saya sudah siap belum", dan
 * satu berkas `GAGAL` tiga tingkat di dalam lenyap dari pandangan begitu
 * daftarnya bertingkat. Kartunya yang harus mengabarkan.
 */
export function EvidenceFolderCard({
	folder,
	jumlahBerkas,
	jumlahPerluPerhatian,
	terpilih,
	canManage,
	onBuka,
	onPilih,
	onGantiNama,
	onPindahkan,
	onHapus,
}: {
	folder: EvidenceFolderEntity;
	jumlahBerkas: number;
	jumlahPerluPerhatian: number;
	terpilih: boolean;
	/** Ganti nama, pindah, dan hapus muncul bersamaan atau tidak sama sekali. */
	canManage: boolean;
	onBuka: () => void;
	onPilih: (aktif: boolean) => void;
	onGantiNama: () => void;
	onPindahkan: () => void;
	onHapus: () => void;
}) {
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={onBuka}
			onKeyDown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					onBuka();
				}
			}}
			className={cn(
				'group relative flex cursor-pointer flex-col gap-3 rounded-xl bg-card p-4 text-left shadow-xs ring-1 transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				terpilih ? 'ring-2 ring-primary' : 'ring-foreground/10',
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-2">
					{canManage && (
						<span
							onClick={(event) => event.stopPropagation()}
							onKeyDown={(event) => event.stopPropagation()}
						>
							<Checkbox
								checked={terpilih}
								onCheckedChange={(nilai) => onPilih(nilai === true)}
								aria-label={`Pilih folder ${folder.nama}`}
								className="cursor-pointer"
							/>
						</span>
					)}
					<FolderIcon
						weight="fill"
						className="size-10 shrink-0 text-amber-500 dark:text-amber-400"
					/>
				</div>

				{canManage && (
					<DropdownMenu>
						<DropdownMenuTrigger
							onClick={(event) => event.stopPropagation()}
							aria-label={`Aksi folder ${folder.nama}`}
							className={cn(
								buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
								'size-7 cursor-pointer',
							)}
						>
							<DotsThreeVerticalIcon className="size-4" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-44 bg-popover">
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={(event) => {
									event.stopPropagation();
									onGantiNama();
								}}
							>
								<PencilSimpleIcon className="size-4" />
								Ganti nama
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={(event) => {
									event.stopPropagation();
									onPindahkan();
								}}
							>
								<ArrowsOutCardinalIcon className="size-4" />
								Pindahkan ke…
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="cursor-pointer text-destructive"
								onClick={(event) => {
									event.stopPropagation();
									onHapus();
								}}
							>
								<TrashIcon className="size-4" />
								Hapus
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			<div className="min-w-0">
				<p className="line-clamp-2 font-medium break-words" title={folder.nama}>
					{folder.nama}
				</p>
				<p className="mt-1 text-xs text-muted-foreground">
					{jumlahBerkas === 0 ? 'Kosong' : `${jumlahBerkas} berkas`}
				</p>
			</div>

			{jumlahPerluPerhatian > 0 ? (
				<span className="inline-flex items-center gap-1 self-start rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
					<WarningCircleIcon weight="fill" className="size-3.5" />
					{jumlahPerluPerhatian} perlu perhatian
				</span>
			) : (
				// Ruang penahan setinggi lencana status di kartu berkas, supaya kartu
				// folder dan kartu berkas tetap sebaris tingginya dalam satu grid.
				<span className="h-5" aria-hidden="true" />
			)}
		</div>
	);
}
