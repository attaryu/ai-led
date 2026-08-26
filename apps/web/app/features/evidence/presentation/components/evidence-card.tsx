import {
	ArrowClockwiseIcon,
	ArrowsOutCardinalIcon,
	DotsThreeVerticalIcon,
	InfoIcon,
	TrashIcon,
} from '@phosphor-icons/react';

import { buttonVariants } from '~/core/components/ui/button';
import { Checkbox } from '~/core/components/ui/checkbox';
import { cn } from '~/core/lib/utils';
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '~/core/components/ui/dropdown-menu';
import { type EvidenceEntity } from '../../domain/entities/evidence.entity';
import { formatRelativeTime } from '~/core/lib/format-time';
import { formatBytes, getFileVisual } from '../utils/evidence-format';
import { EvidenceStatusBadge } from './evidence-status-badge';

/**
 * Satu berkas dalam tampilan kartu ala penjelajah berkas.
 *
 * Seluruh kartu bisa diklik untuk membuka panel detail; menu "..." hanya berisi
 * aksi yang memang boleh dilakukan role pemakai — yang tidak boleh dihilangkan
 * sepenuhnya, bukan sekadar dinonaktifkan (docs/application_flow.md §1).
 */
export function EvidenceCard({
	evidence,
	jalur,
	showOwner,
	canManage,
	canDelete,
	canRetry,
	terpilih,
	onPilih,
	onOpen,
	onDelete,
	onRetry,
	onPindahkan,
}: {
	evidence: EvidenceEntity;
	/**
	 * Jalur folder berkas ini; hanya terisi di mode pencarian, tempat barisnya
	 * memang tercabut dari konteks foldernya (§4.6a).
	 */
	jalur: string[];
	/** Level tenant tidak punya prodi; level prodi tidak perlu mengulang namanya. */
	showOwner: boolean;
	/** Boleh menata isi perpustakaan — menyalakan centang dan "Pindahkan ke…". */
	canManage: boolean;
	canDelete: boolean;
	canRetry: boolean;
	terpilih: boolean;
	onPilih: (aktif: boolean) => void;
	onOpen: (evidence: EvidenceEntity) => void;
	onDelete: (evidence: EvidenceEntity) => void;
	onRetry: (evidence: EvidenceEntity) => void;
	onPindahkan: () => void;
}) {
	const { Icon: FileTypeIcon, className: iconClassName } = getFileVisual(
		evidence.tipeFile,
	);
	const showRetry = canRetry && evidence.status === 'GAGAL';

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onOpen(evidence)}
			onKeyDown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					onOpen(evidence);
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
						// Pembungkusnya menahan klik supaya mencentang tidak sekalian
						// membuka panel detail — seluruh kartu ini sendiri sebuah tombol.
						<span
							onClick={(event) => event.stopPropagation()}
							onKeyDown={(event) => event.stopPropagation()}
						>
							<Checkbox
								checked={terpilih}
								onCheckedChange={(nilai) => onPilih(nilai === true)}
								aria-label={`Pilih ${evidence.namaDokumen}`}
								className="cursor-pointer"
							/>
						</span>
					)}
					<FileTypeIcon
						weight="fill"
						className={cn('size-10 shrink-0', iconClassName)}
					/>
				</div>

				<DropdownMenu>
					<DropdownMenuTrigger
						onClick={(event) => event.stopPropagation()}
						aria-label="Aksi lain"
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
								onOpen(evidence);
							}}
						>
							<InfoIcon className="size-4" />
							Lihat detail
						</DropdownMenuItem>
						{canManage && (
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
						)}
						{showRetry && (
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={(event) => {
									event.stopPropagation();
									onRetry(evidence);
								}}
							>
								<ArrowClockwiseIcon className="size-4" />
								Coba proses lagi
							</DropdownMenuItem>
						)}
						{canDelete && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="cursor-pointer text-destructive"
									onClick={(event) => {
										event.stopPropagation();
										onDelete(evidence);
									}}
								>
									<TrashIcon className="size-4" />
									Hapus
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="min-w-0">
				<p
					className="line-clamp-2 font-medium break-words"
					title={evidence.namaDokumen}
				>
					{evidence.namaDokumen}
				</p>
				<p className="mt-1 text-xs text-muted-foreground">
					{formatBytes(evidence.ukuranBytes)} ·{' '}
					{formatRelativeTime(evidence.waktuDiunggah)}
				</p>
				{jalur.length > 0 && (
					<p
						className="mt-0.5 truncate text-xs text-muted-foreground"
						title={jalur.join(' / ')}
					>
						{jalur.join(' / ')}
					</p>
				)}
				{showOwner && evidence.studyProgramName && (
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{evidence.studyProgramName}
					</p>
				)}
			</div>

			<EvidenceStatusBadge status={evidence.status} className="self-start" />
		</div>
	);
}
