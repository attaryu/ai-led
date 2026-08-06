import {
	ArrowClockwiseIcon,
	DotsThreeVerticalIcon,
	InfoIcon,
	TrashIcon,
} from '@phosphor-icons/react';

import { buttonVariants } from '~/core/components/ui/button';
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
	showOwner,
	canDelete,
	canRetry,
	onOpen,
	onDelete,
	onRetry,
}: {
	evidence: EvidenceEntity;
	/** Level tenant tidak punya prodi; level prodi tidak perlu mengulang namanya. */
	showOwner: boolean;
	canDelete: boolean;
	canRetry: boolean;
	onOpen: (evidence: EvidenceEntity) => void;
	onDelete: (evidence: EvidenceEntity) => void;
	onRetry: (evidence: EvidenceEntity) => void;
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
			className="group relative flex cursor-pointer flex-col gap-3 rounded-xl bg-card p-4 text-left shadow-xs ring-1 ring-foreground/10 transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div className="flex items-start justify-between gap-2">
				<FileTypeIcon
					weight="fill"
					className={cn('size-10 shrink-0', iconClassName)}
				/>

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
