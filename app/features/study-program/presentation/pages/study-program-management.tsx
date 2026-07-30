import * as React from 'react';
import { useNavigate } from 'react-router';
import { PlusIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { DataTable } from '~/core/components/ui/data-table';
import { useDataTableState } from '~/core/hooks/use-data-table-state';
import { studyProgramRepository } from '../../data/repositories/study-program.repository';
import { getStudyProgramColumns } from '../components/study-program-columns';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';

export function StudyProgramManagement() {
	const navigate = useNavigate();
	const [studyPrograms, setStudyPrograms] = React.useState<
		StudyProgramEntity[]
	>([]);

	const loadData = React.useCallback(() => {
		setStudyPrograms(studyProgramRepository.findAll());
	}, []);

	React.useEffect(() => {
		loadData();
		window.addEventListener('storage-update', loadData);
		return () => {
			window.removeEventListener('storage-update', loadData);
		};
	}, [loadData]);

	const handleDelete = React.useCallback((id: string) => {
		if (confirm('Apakah Anda yakin ingin menghapus Prodi ini?')) {
			studyProgramRepository.delete(id);
			loadData();
		}
	}, [loadData]);

	const tableMeta = React.useMemo(() => ({ onDelete: handleDelete }), [handleDelete]);

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

	const columns = React.useMemo(() => getStudyProgramColumns(), []);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Manajemen Program Studi (Prodi)
					</h2>
					<p className="text-sm text-muted-foreground">
						Kelola data Program Studi yang tersedia di sistem
					</p>
				</div>
				<Button
					onClick={() => navigate('/dashboard/study-programs/create')}
					className="gap-2 cursor-pointer"
				>
					<PlusIcon className="size-4" />
					Tambah Prodi
				</Button>
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
