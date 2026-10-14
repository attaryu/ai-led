import * as React from 'react';
import { useNavigate } from 'react-router';
import { PlusIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { useConfirmDialog } from '~/core/components/ui/confirm-dialog';
import { DataTable } from '~/core/components/ui/data-table';
import { useDataTableState } from '~/core/hooks/use-data-table-state';
import { applyAccreditationSetQuery } from '../../domain/dtos/accreditation-set-query.dto';
import { accreditationSetRepository } from '../../data/repositories/accreditation-set.repository';
import { getAccreditationSetColumns } from '../components/accreditation-set-columns';
import { useAccreditationSetPermission } from '../hooks/use-accreditation-set-permission';
import { type AccreditationSetEntity } from '../../domain/entities/accreditation-set.entity';

export function AccreditationSetManagement() {
	const navigate = useNavigate();
	const { canView, canManage } = useAccreditationSetPermission();
	const [sets, setSets] = React.useState<AccreditationSetEntity[]>([]);
	const [aksiError, setAksiError] = React.useState<string | null>(null);
	const { konfirmasi, confirmDialog } = useConfirmDialog();

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
		async (id: string) => {
			const lanjut = await konfirmasi({
				judul: 'Hapus instrumen akreditasi ini?',
				deskripsi:
					'Berkas acuan dan isi rubriknya ikut terhapus. Instrumen yang sudah dipakai Dokumen LED tidak bisa dihapus.',
				labelAksi: 'Hapus Instrumen',
				merusak: true,
			});
			if (!lanjut) return;

			setAksiError(null);

			// Penolakan datang dari repository, bukan dari tombol yang dimatikan:
			// set bisa saja baru dipilih sebuah dokumen sesudah daftar ini termuat,
			// dan pesannya harus tetap muncul alih-alih baris yang diam-diam hilang.
			try {
				await accreditationSetRepository.delete(id);
				loadData();
			} catch (e) {
				setAksiError(e instanceof Error ? e.message : 'Gagal menghapus instrumen.');
			}
		},
		[loadData, konfirmasi],
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

	// Sama seperti tabel kriteria: `DataTable` tidak menyaring apa pun sendiri,
	// jadi kotak pencarian di atasnya baru bekerja setelah dikerjakan di sini.
	const halaman = React.useMemo(
		() =>
			applyAccreditationSetQuery(sets, {
				q: globalFilter,
				sort: sorting[0]?.id,
				dir: sorting[0]?.desc ? 'desc' : 'asc',
				page: pagination.pageIndex,
				pageSize: pagination.pageSize,
			}),
		[sets, globalFilter, sorting, pagination],
	);

	// Menyembunyikan menu di sidebar saja tidak cukup: lapis tenant tetap
	// meloloskan Admin, jadi alamat ini masih bisa dibuka langsung. Isi halaman
	// yang menentukan, bukan menunya.
	if (!canView) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Instrumen akreditasi adalah bagian dari konten akreditasi, di luar kewenangan
				Admin.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					{/*
					 * Satu judul untuk kedua hak akses, sama seperti di
					 * study-program-management.tsx: halaman yang berganti nama antara
					 * "Instrumen Akreditasi" dan "Daftar Instrumen Akreditasi" tidak memberi
					 * pembaca cara tahu kenapa namanya berbeda dari yang dilihat
					 * rekannya.
					 */}
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Instrumen Akreditasi
					</h2>
					<p className="text-sm text-muted-foreground">
						Rubrik, panduan, dan template dari satu lembaga penilai untuk satu
						siklus. Tiap Dokumen LED memilih instrumen mana yang dipakainya.
					</p>
				</div>
				{canManage && (
					<Button
						onClick={() => navigate('/dashboard/accreditation-sets/create')}
						className="gap-2 cursor-pointer"
					>
						<PlusIcon className="size-4" />
						Tambah Instrumen
					</Button>
				)}
			</div>

			{aksiError && (
				<p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{aksiError}
				</p>
			)}

			<DataTable
				columns={columns}
				data={halaman.rows}
				rowCount={halaman.rowCount}
				meta={tableMeta}
				searchPlaceholder="Cari nama instrumen, lembaga, atau siklus..."
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
