import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { TrashIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { Button } from '~/core/components/ui/button';
import { type AccreditationSetEntity } from '../../domain/entities/accreditation-set.entity';
import { SetCompletenessCell } from './set-completeness-cell';
import { SetStatusBadge } from './set-status-badge';

declare module '@tanstack/react-table' {
	interface TableMeta<TData> {
		onDeleteSet?: (id: string) => void;
	}
}

const columnHelper = createColumnHelper<AccreditationSetEntity>();

/**
 * `withActions` mengikuti prinsip §1 seperti tabel prodi: kontrol yang tidak
 * boleh dipakai suatu role disembunyikan sepenuhnya, bukan dinonaktifkan.
 * Pimpinan memakai tabel ini untuk melihat acuan yang berlaku, bukan
 * mengelolanya.
 *
 * Tidak ada tombol sunting terpisah: menyunting set berarti membuka detailnya,
 * dan nama set sudah menjadi tautan ke sana.
 */
export const getAccreditationSetColumns = ({
	withActions = true,
}: { withActions?: boolean } = {}): ColumnDef<AccreditationSetEntity, any>[] => [
	columnHelper.accessor('nama', {
		header: 'Nama Set',
		cell: (info) => (
			<Link
				to={`/dashboard/accreditation-sets/${info.row.original.id}`}
				className="font-medium text-primary underline-offset-4 hover:underline"
			>
				{info.getValue()}
			</Link>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('lembaga', {
		header: 'Lembaga Penilai',
		cell: (info) => <span>{info.getValue()}</span>,
		enableSorting: true,
	}),
	columnHelper.accessor('tahunSiklus', {
		header: 'Siklus',
		cell: (info) => (
			<span className="font-medium tabular-nums">{info.getValue()}</span>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('status', {
		header: 'Status',
		cell: (info) => <SetStatusBadge status={info.getValue()} />,
		enableSorting: true,
	}),
	// Bukan accessor ke satu kolom: kelengkapan diturunkan dari seluruh daftar
	// berkasnya, jadi tidak ada satu field pun yang bisa diurutkan di sini.
	columnHelper.display({
		id: 'kelengkapan',
		header: 'Kelengkapan Berkas',
		cell: (info) => <SetCompletenessCell set={info.row.original} />,
	}),
	// Berkas lengkap tidak sama dengan isi terbaca: rubrik yang sudah diunggah
	// tapi belum dimasukkan kriterianya menghasilkan penilaian tanpa indikator.
	// Karena itu jumlahnya berdiri sebagai kolom sendiri, bukan menumpang kolom
	// kelengkapan berkas di sebelahnya.
	columnHelper.display({
		id: 'isiRubrik',
		header: 'Isi Rubrik',
		cell: (info) => {
			const jumlah = info.row.original.kriteria.length;

			return jumlah === 0 ? (
				<span className="text-sm text-muted-foreground">Belum diisi</span>
			) : (
				<span className="text-sm tabular-nums">{jumlah} kriteria</span>
			);
		},
	}),
	...(withActions
		? [
				columnHelper.display({
					id: 'aksi',
					header: 'Aksi',
					cell: (info) => (
						<Button
							variant="ghost"
							size="icon"
							title="Hapus set"
							className="cursor-pointer text-destructive hover:text-destructive"
							onClick={() =>
								info.table.options.meta?.onDeleteSet?.(info.row.original.id)
							}
						>
							<TrashIcon className="size-4" />
						</Button>
					),
				}),
			]
		: []),
];
