import * as React from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { TrashIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { Button } from '~/core/components/ui/button';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';
import { LedProjectStatusBadge } from './led-project-status-badge';

const columnHelper = createColumnHelper<LedProjectEntity>();

/**
 * `withActions` disembunyikan untuk role selain Penjamin Mutu — siklus dokumen
 * (buat, ubah status, kunci bab) sepenuhnya wewenang Penjamin Mutu, sedangkan
 * Pimpinan read-only di level ini (§6.2).
 */
export const getLedProjectColumns = ({
	withActions = true,
}: { withActions?: boolean } = {}): ColumnDef<LedProjectEntity, any>[] => [
	columnHelper.accessor('judul', {
		header: 'Judul Proyek',
		// Pintasan langsung ke Lapis 3, tanpa lewat Dashboard Prodi.
		cell: (info) => (
			<Link
				to={`/led-projects/${info.row.original.id}`}
				className="font-medium text-primary underline-offset-4 hover:underline"
			>
				{info.getValue()}
			</Link>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('studyProgramName', {
		header: 'Program Studi',
		// Jalan masuk ke Lapis 2 milik prodi dokumen ini.
		cell: (info) => (
			<Link
				to={`/study-programs/${info.row.original.studyProgramId}`}
				className="underline-offset-4 hover:underline"
			>
				{info.getValue()}
			</Link>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('tahunAkademik', {
		header: 'Tahun Akademik',
		cell: (info) => <span>{info.getValue()}</span>,
		enableSorting: true,
	}),
	columnHelper.accessor('statusKeseluruhan', {
		header: 'Status',
		cell: (info) => <LedProjectStatusBadge status={info.getValue()} />,
		enableSorting: true,
	}),
	columnHelper.accessor('createdAt', {
		header: 'Tanggal Dibuat',
		cell: (info) =>
			new Date(info.getValue()).toLocaleDateString('id-ID', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			}),
		enableSorting: true,
	}),
	...(withActions
		? [
				columnHelper.display({
					id: 'actions',
					header: 'Aksi',
					enableHiding: false,
					cell: (props) => {
						const id = props.row.original.id;
						const onDelete = props.table.options.meta?.onDelete;
						const onEdit = props.table.options.meta?.onEdit;
						return (
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="icon-sm"
									onClick={() => onEdit?.(id)}
									className="cursor-pointer"
								>
									<PencilSimpleIcon className="size-4" />
								</Button>
								<Button
									variant="destructive"
									size="icon-sm"
									onClick={() => onDelete?.(id)}
									className="cursor-pointer"
								>
									<TrashIcon className="size-4" />
								</Button>
							</div>
						);
					},
				}),
			]
		: []),
];
