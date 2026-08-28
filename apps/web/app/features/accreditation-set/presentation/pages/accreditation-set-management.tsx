import * as React from 'react';
import { useNavigate } from 'react-router';
import { PlusIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { DataTable } from '~/core/components/ui/data-table';
import { useDataTableState } from '~/core/hooks/use-data-table-state';
import { accreditationSetRepository } from '../../data/repositories/accreditation-set.repository';
import { getAccreditationSetColumns } from '../components/accreditation-set-columns';
import { useAccreditationSetPermission } from '../hooks/use-accreditation-set-permission';
import { type AccreditationSetEntity } from '../../domain/entities/accreditation-set.entity';

export function AccreditationSetManagement() {
	const navigate = useNavigate();
	const { canView, canManage } = useAccreditationSetPermission();
	const [sets, setSets] = React.useState<AccreditationSetEntity[]>([]);

	const loadData = React.useCallback(() => {
		accreditationSetRepository.findAll().then(setSets);
	}, []);

	React.useEffect(() => {
		loadData();
		window.addEventListener('storage-update', loadData);
		return () => {
			window.removeEventListener('storage-update', loadData);
		};
	}, [loadData]);

	const handleDelete = React.useCallback(
		(id: string) => {
			if (
				confirm(
					'Hapus set akreditasi ini beserta seluruh berkas acuannya?',
				)
			) {
				accreditationSetRepository.delete(id).then(loadData);
			}
		},
		[loadData],
	);

	const tableMeta = React.useMemo(
		() => ({ onDeleteSet: handleDelete }),
		[handleDelete],
	);

	const {
		sorting,
		setSorting,
		globalFilter,
		setGlobalFilter,
		pagination,
		setPagination,
		columnVisibility,
		setColumnVisibility,
		clearAll,
	} = useDataTableState('accreditation-sets');

	const columns = React.useMemo(
		() => getAccreditationSetColumns({ withActions: canManage }),
		[canManage],
	);

	// Menyembunyikan menu di sidebar saja tidak cukup: lapis tenant tetap
	// meloloskan Admin, jadi alamat ini masih bisa dibuka langsung. Isi halaman
	// yang menentukan, bukan menunya.
	if (!canView) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Set akreditasi adalah bagian dari konten akreditasi, di luar kewenangan
				Admin.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						{canManage ? 'Set Akreditasi' : 'Daftar Set Akreditasi'}
					</h2>
					<p className="text-sm text-muted-foreground">
						Rubrik, panduan, dan template dari satu lembaga penilai untuk satu
						siklus. Tiap proyek Dokumen LED memilih set mana yang dipakainya.
					</p>
				</div>
				{canManage && (
					<Button
						onClick={() => navigate('/dashboard/accreditation-sets/create')}
						className="gap-2 cursor-pointer"
					>
						<PlusIcon className="size-4" />
						Tambah Set
					</Button>
				)}
			</div>

			<DataTable
				columns={columns}
				data={sets}
				meta={tableMeta}
				sorting={sorting}
				onSortingChange={setSorting}
				globalFilter={globalFilter}
				onGlobalFilterChange={setGlobalFilter}
				columnVisibility={columnVisibility}
				onColumnVisibilityChange={setColumnVisibility}
				pagination={pagination}
				onPaginationChange={setPagination}
				onClearAll={clearAll}
			/>
		</div>
	);
}
