import * as React from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { TrashIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { Button } from '~/core/components/ui/button';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';
import { AccreditationRankBadge } from './accreditation-rank-badge';

// Extend TableMeta to support custom functions (like onDelete, onEdit) passed to the table
declare module '@tanstack/react-table' {
	interface TableMeta<TData> {
		onDelete?: (id: string) => void;
		onEdit?: (id: string) => void;
	}
}

const columnHelper = createColumnHelper<StudyProgramEntity>();

/**
 * `withActions` mengikuti prinsip §1: kontrol yang tidak boleh dipakai suatu
 * role disembunyikan sepenuhnya, bukan dinonaktifkan. Penjamin Mutu memakai
 * tabel ini murni sebagai jalan masuk ke Dashboard Program Studi (§4.3), bukan untuk
 * mengelola prodi (§4.1).
 */
export const getStudyProgramColumns = ({
	withActions = true,
}: { withActions?: boolean } = {}): ColumnDef<StudyProgramEntity, any>[] => [
	columnHelper.accessor('id', {
		header: 'ID',
		cell: (info) => (
			<span className="font-mono text-xs">{info.getValue()}</span>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('studyProgramName', {
		header: 'Nama Program Studi',
		// Jalan masuk ke Lapis 2 (Dashboard Program Studi).
		cell: (info) => (
			<Link
				to={`/study-programs/${info.row.original.id}`}
				className="font-medium text-primary underline-offset-4 hover:underline"
			>
				{info.getValue()}
			</Link>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('jenjang', {
		header: 'Jenjang',
		cell: (info) => (
			<span className="font-medium tabular-nums">{info.getValue()}</span>
		),
		enableSorting: true,
	}),
	// Cukup peringkatnya; sisa identitas akreditasi (SK, masa berlaku, ketua
	// prodi) ada di Dashboard Program Studi masing-masing, bukan di daftar lintas program studi.
	columnHelper.accessor('peringkatAkreditasi', {
		header: 'Akreditasi',
		cell: (info) => <AccreditationRankBadge peringkat={info.getValue()} />,
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
					enableHiding: false, // Kolom aksi tidak boleh disembunyikan
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
