import * as React from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { TrashIcon, PencilSimpleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';

const columnHelper = createColumnHelper<LedProjectEntity>();

export const getLedProjectColumns = (): ColumnDef<
	LedProjectEntity,
	any
>[] => [
	columnHelper.accessor('judul', {
		header: 'Judul Proyek',
		cell: (info) => <span className="font-medium">{info.getValue()}</span>,
		enableSorting: true,
	}),
	columnHelper.accessor('studyProgramName', {
		header: 'Program Studi',
		cell: (info) => <span>{info.getValue()}</span>,
		enableSorting: true,
	}),
	columnHelper.accessor('tahunAkademik', {
		header: 'Tahun Akademik',
		cell: (info) => <span>{info.getValue()}</span>,
		enableSorting: true,
	}),
	columnHelper.accessor('statusKeseluruhan', {
		header: 'Status',
		cell: (info) => {
			const val = info.getValue() as string;
			const colors: Record<string, string> = {
				DRAFT:
					'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200/50 dark:border-slate-800/30',
				REVIEW:
					'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/50 dark:border-amber-800/30',
				SELESAI:
					'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-800/30',
			};
			return (
				<span
					className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colors[val] || ''}`}
				>
					{val}
				</span>
			);
		},
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
];
