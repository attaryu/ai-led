import * as React from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { TrashIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { type UserEntity } from '../../domain/entities/user.entity';

const columnHelper = createColumnHelper<UserEntity>();

export const getUserColumns = (): ColumnDef<UserEntity, any>[] => [
	columnHelper.accessor('namaLengkap', {
		header: 'Nama Lengkap',
		cell: (info) => <span className="font-medium">{info.getValue()}</span>,
		enableSorting: true,
	}),
	columnHelper.accessor('email', {
		header: 'Email',
		cell: (info) => (
			<span className="text-muted-foreground">{info.getValue()}</span>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('role', {
		header: 'Role',
		cell: (info) => {
			const val = info.getValue() as string;
			const colors: Record<string, string> = {
				'Penjamin Mutu': 'bg-primary/10 text-primary border-primary/20',
				Penyusun:
					'bg-secondary/20 text-secondary-foreground border-secondary',
				Pimpinan:
					'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/50 dark:border-amber-800/30',
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
	columnHelper.accessor('studyProgramName', {
		header: 'Program Studi',
		cell: (info) =>
			info.getValue() || (
				<span className="text-muted-foreground font-mono text-xs">-</span>
			),
		enableSorting: true,
	}),
	columnHelper.accessor('createdAt', {
		header: 'Tanggal Terdaftar',
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
			return (
				<Button
					variant="destructive"
					size="icon-sm"
					onClick={() => onDelete?.(id)}
					className="cursor-pointer"
				>
					<TrashIcon className="size-4" />
				</Button>
			);
		},
	}),
];
