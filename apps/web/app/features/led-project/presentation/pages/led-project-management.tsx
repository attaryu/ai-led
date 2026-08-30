import * as React from 'react';
import { useNavigate } from 'react-router';
import { PlusIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { useConfirmDialog } from '~/core/components/ui/confirm-dialog';
import { DataTable } from '~/core/components/ui/data-table';
import { useDataTableState } from '~/core/hooks/use-data-table-state';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { ledProjectRepository } from '../../data/repositories/led-project.repository';
import { getLedProjectColumns } from '../components/led-project-columns';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';

export function LedProjectManagement() {
	const navigate = useNavigate();
	const session = useSession();
	const { konfirmasi, confirmDialog } = useConfirmDialog();
	// Penyusunan Dokumen LED sepenuhnya wewenang Penjamin Mutu; Pimpinan read-only
	// di level ini (§6.2).
	const canManage = session?.role === 'Penjamin Mutu';
	const [ledProjects, setLedProjects] = React.useState<LedProjectEntity[]>([]);

	const loadData = React.useCallback(() => {
		setLedProjects(ledProjectRepository.findAll());
	}, []);

	React.useEffect(() => {
		loadData();
		window.addEventListener('storage-update', loadData);
		return () => {
			window.removeEventListener('storage-update', loadData);
		};
	}, [loadData]);

	const handleDelete = React.useCallback(
		async (id: string) => {
			const lanjut = await konfirmasi({
				judul: 'Hapus Dokumen LED ini?',
				deskripsi:
					'Seluruh bab beserta isinya ikut terhapus, dan tidak bisa dipulihkan.',
				labelAksi: 'Hapus',
				merusak: true,
			});
			if (!lanjut) return;

			ledProjectRepository.delete(id);
			loadData();
			// Dispatch custom event to notify other tables/UI that storage updated
			window.dispatchEvent(new Event('storage-update'));
		},
		[konfirmasi, loadData],
	);

	const handleEdit = React.useCallback((id: string) => {
		navigate(`/dashboard/led-projects/${id}/edit`);
	}, [navigate]);

	const tableMeta = React.useMemo(() => ({
		onDelete: handleDelete,
		onEdit: handleEdit,
	}), [handleDelete, handleEdit]);

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
	} = useDataTableState('led-projects');

	const columns = React.useMemo(
		() => getLedProjectColumns({ withActions: canManage }),
		[canManage],
	);

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Dokumen LED lintas program studi
					</h2>
					<p className="text-sm text-muted-foreground">
						Tiap program studi punya satu dokumen per tahun akademik.
					</p>
				</div>
				{canManage && (
					<Button
						onClick={() => navigate('/dashboard/led-projects/create')}
						className="gap-2 cursor-pointer"
					>
						<PlusIcon className="size-4" />
						Tambah Dokumen LED
					</Button>
				)}
			</div>

			<DataTable
				columns={columns}
				data={ledProjects}
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

			{confirmDialog}
		</div>
	);
}
