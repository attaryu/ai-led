import * as React from 'react';
import { useNavigate } from 'react-router';
import { PlusIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { DataTable } from '~/core/components/ui/data-table';
import { useDataTableState } from '~/core/hooks/use-data-table-state';
import { userRepository } from '../../data/repositories/user.repository';
import { getUserColumns } from '../components/user-columns';
import { type UserEntity } from '../../domain/entities/user.entity';

export function UserManagement() {
	const navigate = useNavigate();
	const [users, setUsers] = React.useState<UserEntity[]>([]);

	const loadData = React.useCallback(() => {
		setUsers(userRepository.findAll());
	}, []);

	React.useEffect(() => {
		loadData();
		window.addEventListener('storage-update', loadData);
		return () => {
			window.removeEventListener('storage-update', loadData);
		};
	}, [loadData]);

	const handleDelete = React.useCallback((id: string) => {
		if (confirm('Apakah Anda yakin ingin menghapus pengguna ini?')) {
			userRepository.delete(id);
			loadData();
		}
	}, [loadData]);

	const handleEdit = React.useCallback((id: string) => {
		navigate(`/dashboard/users/${id}/edit`);
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
	} = useDataTableState('users');

	const columns = React.useMemo(() => getUserColumns(), []);

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Pengguna
					</h2>
				</div>
				<Button
					onClick={() => navigate('/dashboard/users/create')}
					className="gap-2 cursor-pointer"
				>
					<PlusIcon className="size-4" />
					Tambah pengguna
				</Button>
			</div>

			<DataTable
				columns={columns}
				data={users}
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
