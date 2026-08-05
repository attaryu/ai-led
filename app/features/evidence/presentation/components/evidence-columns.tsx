import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import {
	ArrowClockwiseIcon,
	InfoIcon,
	TrashIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { cn } from '~/core/lib/utils';
import { type EvidenceEntity } from '../../domain/entities/evidence.entity';
import {
	formatBytes,
	formatRelativeTime,
	getFileVisual,
} from '../utils/evidence-format';
import { EvidenceStatusBadge } from './evidence-status-badge';

const columnHelper = createColumnHelper<EvidenceEntity>();

/**
 * Kolom tabel bukti dukung. `id` tiap kolom sengaja sama dengan kunci pengurutan
 * yang dikenali `evidenceRepository.findPaged`, karena pengurutan dilakukan di
 * sumber data (mode manual), bukan di dalam tabel.
 */
export const getEvidenceColumns = ({
	showOwner,
	canDelete,
	canRetry,
	onOpen,
	onDelete,
	onRetry,
}: {
	showOwner: boolean;
	canDelete: (evidence: EvidenceEntity) => boolean;
	canRetry: (evidence: EvidenceEntity) => boolean;
	onOpen: (evidence: EvidenceEntity) => void;
	onDelete: (evidence: EvidenceEntity) => void;
	onRetry: (evidence: EvidenceEntity) => void;
}): ColumnDef<EvidenceEntity, any>[] => [
	columnHelper.accessor('namaDokumen', {
		header: 'Nama Dokumen',
		enableSorting: true,
		cell: (info) => {
			const evidence = info.row.original;
			const { Icon: FileTypeIcon, className } = getFileVisual(evidence.tipeFile);
			return (
				<button
					type="button"
					onClick={() => onOpen(evidence)}
					className="flex max-w-[22rem] cursor-pointer items-center gap-2 text-left"
				>
					<FileTypeIcon
						weight="fill"
						className={cn('size-5 shrink-0', className)}
					/>
					<span className="truncate font-medium text-primary underline-offset-4 hover:underline">
						{evidence.namaDokumen}
					</span>
				</button>
			);
		},
	}),
	...(showOwner
		? [
				columnHelper.accessor('studyProgramName', {
					header: 'Pemilik',
					enableSorting: true,
					cell: (info) => info.getValue() ?? 'Universitas',
				}),
			]
		: []),
	columnHelper.accessor('tipeFile', {
		header: 'Tipe',
		enableSorting: true,
		cell: (info) => (
			<span className="uppercase text-muted-foreground">{info.getValue()}</span>
		),
	}),
	columnHelper.accessor('ukuranBytes', {
		header: 'Ukuran',
		enableSorting: true,
		cell: (info) => formatBytes(info.getValue()),
	}),
	columnHelper.accessor('status', {
		header: 'Status',
		enableSorting: true,
		cell: (info) => <EvidenceStatusBadge status={info.getValue()} />,
	}),
	columnHelper.accessor('uploadedByName', {
		header: 'Diunggah Oleh',
		enableSorting: true,
	}),
	columnHelper.accessor('waktuDiunggah', {
		header: 'Waktu Unggah',
		enableSorting: true,
		cell: (info) => (
			<span title={info.getValue()}>{formatRelativeTime(info.getValue())}</span>
		),
	}),
	columnHelper.display({
		id: 'actions',
		header: 'Aksi',
		enableHiding: false,
		cell: (props) => {
			const evidence = props.row.original;
			const showRetry = canRetry(evidence) && evidence.status === 'GAGAL';

			return (
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Lihat detail"
						onClick={() => onOpen(evidence)}
						className="cursor-pointer"
					>
						<InfoIcon className="size-4" />
					</Button>
					{showRetry && (
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Coba proses lagi"
							onClick={() => onRetry(evidence)}
							className="cursor-pointer"
						>
							<ArrowClockwiseIcon className="size-4" />
						</Button>
					)}
					{canDelete(evidence) && (
						<Button
							variant="destructive"
							size="icon-sm"
							aria-label="Hapus"
							onClick={() => onDelete(evidence)}
							className="cursor-pointer"
						>
							<TrashIcon className="size-4" />
						</Button>
					)}
				</div>
			);
		},
	}),
];
