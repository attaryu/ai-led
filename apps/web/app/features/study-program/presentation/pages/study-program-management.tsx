import * as React from 'react';
import { useNavigate } from 'react-router';
import { PlusIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { DataTable } from '~/core/components/ui/data-table';
import { useDataTableState } from '~/core/hooks/use-data-table-state';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { studyProgramRepository } from '../../data/repositories/study-program.repository';
import { getStudyProgramColumns } from '../components/study-program-columns';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';

export function StudyProgramManagement() {
	const navigate = useNavigate();
	const session = useSession();
	// Penjamin Mutu tidak mengelola prodi (§4.1) — halaman ini baginya hanya
	// daftar navigasi ke Dashboard Prodi (§4.3).
	const canManage = session?.role === 'Admin' || session?.role === 'Pimpinan';
	const [studyPrograms, setStudyPrograms] = React.useState<
		StudyProgramEntity[]
	>([]);

	const loadData = React.useCallback(async () => {
		setStudyPrograms(await studyProgramRepository.findAll());
	}, []);

	React.useEffect(() => {
		void loadData();
		window.addEventListener('storage-update', loadData);
		return () => {
			window.removeEventListener('storage-update', loadData);
		};
	}, [loadData]);

	const handleDelete = React.useCallback(
		(id: string) => {
			if (confirm('Apakah Anda yakin ingin menghapus Prodi ini?')) {
				// `delete()` menyiarkan 'storage-update' sendiri setelah selesai —
				// listener di atas yang memuat ulang, tidak perlu dipanggil di sini.
				studyProgramRepository.delete(id).catch((e: unknown) => {
					alert(e instanceof Error ? e.message : 'Gagal menghapus Prodi.');
				});
			}
		},
		[],
	);

	const handleEdit = React.useCallback((id: string) => {
		navigate(`/dashboard/study-programs/${id}/edit`);
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
	} = useDataTableState('study-programs');

	const columns = React.useMemo(
		() => getStudyProgramColumns({ withActions: canManage }),
		[canManage],
	);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						{canManage ? 'Manajemen Program Studi (Prodi)' : 'Daftar Program Studi'}
					</h2>
					<p className="text-sm text-muted-foreground">
						Klik nama prodi untuk membuka Dashboard Prodi-nya
					</p>
				</div>
				{canManage && (
					<Button
						onClick={() => navigate('/dashboard/study-programs/create')}
						className="gap-2 cursor-pointer"
					>
						<PlusIcon className="size-4" />
						Tambah Prodi
					</Button>
				)}
			</div>

			<DataTable
				columns={columns}
				data={studyPrograms}
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
