import * as React from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { TrashIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';

// Extend TableMeta to support custom functions (like onDelete) passed to the table
declare module '@tanstack/react-table' {
	interface TableMeta<TData> {
		onDelete?: (id: string) => void;
	}
}

const columnHelper = createColumnHelper<StudyProgramEntity>();

export const getStudyProgramColumns = (): ColumnDef<
	StudyProgramEntity,
	any
>[] => [
	columnHelper.accessor('id', {
		header: 'ID',
		cell: (info) => (
			<span className="font-mono text-xs">{info.getValue()}</span>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('studyProgramName', {
		header: 'Nama Program Studi',
		cell: (info) => <span className="font-medium">{info.getValue()}</span>,
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
		enableHiding: false, // Kolom aksi tidak boleh disembunyikan
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
