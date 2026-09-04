import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	rubricScoreTypeLabels,
	skorMaksimal,
	type RubricCriterion,
	type RubricScoreType,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { ChapterBadgeList } from './chapter-badge-list';

declare module '@tanstack/react-table' {
	interface TableMeta<TData> {
		onEditCriterion?: (criterion: RubricCriterion) => void;
		onDeleteCriterion?: (criterion: RubricCriterion) => void;
	}
}

const columnHelper = createColumnHelper<RubricCriterion>();

/**
 * Tabel isi rubrik satu set.
 *
 * `withActions` mati untuk dua sebab yang berbeda tapi berakhir sama: role yang
 * tidak berhak mengelola, dan set yang isinya sudah terkunci. Keduanya
 * menyembunyikan tombolnya, bukan menonaktifkannya — sejalan dengan tabel lain
 * di fitur ini.
 */
export const getCriterionColumns = ({
	withActions = true,
}: { withActions?: boolean } = {}): ColumnDef<RubricCriterion, any>[] => [
	columnHelper.accessor('no', {
		header: 'No',
		cell: (info) => (
			<span className="font-medium tabular-nums">{info.getValue()}</span>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('kodeKriteria', {
		header: 'Kode',
		cell: (info) => (
			<span className="font-mono text-xs">{info.getValue()}</span>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('kriteria', {
		header: 'Kelompok Kriteria',
		cell: (info) => <span className="font-medium">{info.getValue()}</span>,
		enableSorting: true,
	}),
	columnHelper.accessor('deskripsi', {
		header: 'Bunyi Kriteria',
		cell: (info) => (
			// `title` menyimpan bunyi utuhnya: memotongnya di tabel menjaga baris
			// tetap terbaca, tapi teks yang hilang harus tetap bisa dijangkau tanpa
			// membuka dialog sunting.
			<p
				className="max-w-[26rem] truncate text-muted-foreground"
				title={info.getValue()}
			>
				{info.getValue()}
			</p>
		),
		enableSorting: false,
	}),
	columnHelper.accessor('tipeSkor', {
		header: 'Tipe Skor',
		cell: (info) => (
			<span className="text-sm">
				{rubricScoreTypeLabels[info.getValue() as RubricScoreType]}
			</span>
		),
		enableSorting: true,
	}),
	// Bukan accessor: yang ditampilkan daftar nomor bab, dan mengurutkan larik
	// tidak punya arti yang bisa dijelaskan ke pembacanya.
	columnHelper.display({
		id: 'urutanBab',
		header: 'Bab yang Dinilai',
		cell: (info) => <ChapterBadgeList urutanBab={info.row.original.urutanBab} />,
	}),
	columnHelper.display({
		id: 'skala',
		header: 'Skala',
		cell: (info) => {
			const kriteria = info.row.original;
			const terendah = Math.min(...kriteria.levelSkor.map((l) => l.skor));

			return (
				<span className="text-sm tabular-nums text-muted-foreground">
					{terendah}–{skorMaksimal(kriteria)}
					<span className="ml-1 text-xs">
						({kriteria.levelSkor.length} level)
					</span>
				</span>
			);
		},
	}),
	...(withActions
		? [
				columnHelper.display({
					id: 'aksi',
					header: 'Aksi',
					cell: (info) => (
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon"
								title="Koreksi kriteria"
								className="cursor-pointer"
								onClick={() =>
									info.table.options.meta?.onEditCriterion?.(info.row.original)
								}
							>
								<PencilSimpleIcon className="size-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								title="Hapus kriteria"
								className="cursor-pointer text-destructive hover:text-destructive"
								onClick={() =>
									info.table.options.meta?.onDeleteCriterion?.(
										info.row.original,
									)
								}
							>
								<TrashIcon className="size-4" />
							</Button>
						</div>
					),
				}),
			]
		: []),
];
