import * as React from 'react';
import {
	useReactTable,
	getCoreRowModel,
	getSortedRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	flexRender,
	type ColumnDef,
	type SortingState,
	type VisibilityState,
	type OnChangeFn,
	type TableMeta,
} from '@tanstack/react-table';
import {
	ArrowsDownUpIcon,
	SlidersHorizontalIcon,
	ArrowLeftIcon,
	ArrowRightIcon,
	XCircleIcon,
} from '@phosphor-icons/react';

import { Button, buttonVariants } from '~/core/components/ui/button';
import { cn } from '~/core/lib/utils';
import { Input } from '~/core/components/ui/input';
import { Select } from '~/core/components/ui/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/core/components/ui/table';
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuCheckboxItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuGroup,
} from '~/core/components/ui/dropdown-menu';

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	searchPlaceholder?: string;
	meta?: TableMeta<TData>;

	// State controlled from outside (e.g. URL search params or Zustand)
	sorting: SortingState;
	onSortingChange: OnChangeFn<SortingState>;
	globalFilter: string;
	onGlobalFilterChange: (value: string) => void;
	columnVisibility: VisibilityState;
	onColumnVisibilityChange: OnChangeFn<VisibilityState>;
	onClearAll: () => void;

	// Optional pagination controlled state (if needed, otherwise default to local)
	pagination?: { pageIndex: number; pageSize: number };
	onPaginationChange?: OnChangeFn<{ pageIndex: number; pageSize: number }>;

	/**
	 * Jumlah seluruh baris hasil penyaringan di sisi sumber data.
	 *
	 * Tabel ini berjalan dalam mode manual (`manualPagination` dkk), artinya
	 * `data` yang masuk sudah dipotong per halaman — tanpa nilai ini tabel tidak
	 * punya cara tahu ada berapa halaman, dan "Total n data" hanya menghitung
	 * baris halaman yang sedang tampil.
	 */
	rowCount?: number;

	/**
	 * Dimatikan bila pemanggil sudah menyediakan toolbar/footer sendiri di luar
	 * tabel — dipakai halaman yang punya dua mode tampilan (kartu & tabel) agar
	 * kontrolnya tidak dobel.
	 */
	showToolbar?: boolean;
	showFooter?: boolean;
}

export function DataTable<TData, TValue>({
	columns,
	data,
	searchPlaceholder = 'Cari data...',
	meta,
	sorting,
	onSortingChange,
	globalFilter,
	onGlobalFilterChange,
	columnVisibility,
	onColumnVisibilityChange,
	onClearAll,
	pagination,
	onPaginationChange,
	rowCount,
	showToolbar = true,
	showFooter = true,
}: DataTableProps<TData, TValue>) {
	const [localPagination, setLocalPagination] = React.useState({
		pageIndex: 0,
		pageSize: 10,
	});

	const paginationState = pagination ?? localPagination;
	const handlePaginationChange = React.useCallback(
		(updaterOrValue: any) => {
			if (onPaginationChange) {
				onPaginationChange(updaterOrValue);
			} else {
				setLocalPagination(updaterOrValue);
			}
		},
		[onPaginationChange],
	);

	const table = useReactTable({
		data,
		columns,
		state: {
			sorting,
			globalFilter,
			columnVisibility,
			pagination: paginationState,
		},
		onSortingChange,
		onGlobalFilterChange,
		onColumnVisibilityChange,
		onPaginationChange: handlePaginationChange,
		getCoreRowModel: getCoreRowModel(),
		rowCount,
		manualPagination: true,
		manualSorting: true,
		manualFiltering: true,
		meta,
	});

	const activeSort = sorting[0] ?? null;
	const activeSortId = activeSort ? activeSort.id : '';
	const activeSortDir = activeSort ? (activeSort.desc ? 'desc' : 'asc') : '';

	const handleSortColumnChange = React.useCallback(
		(columnId: string) => {
			if (!columnId) {
				onSortingChange([]);
			} else {
				const desc = activeSortDir === 'desc';
				onSortingChange([{ id: columnId, desc }]);
			}
		},
		[activeSortDir, onSortingChange],
	);

	const handleSortDirChange = React.useCallback(
		(dir: string) => {
			if (activeSortId) {
				onSortingChange([{ id: activeSortId, desc: dir === 'desc' }]);
			}
		},
		[activeSortId, onSortingChange],
	);

	const hasActiveFilters = sorting.length > 0 || globalFilter !== '';

	return (
		<div className="flex flex-col gap-4">
			{/* Controls: Search, Column Visibility, Clear Button */}
			{showToolbar && (
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-1 min-w-[240px] max-w-sm items-center gap-2">
					<Input
						placeholder={searchPlaceholder}
						value={globalFilter}
						onChange={(e) => onGlobalFilterChange(e.target.value)}
						className="h-9"
					/>
				</div>

				<div className="flex items-center gap-2">
					{hasActiveFilters && (
						<Button
							variant="outline"
							size="sm"
							onClick={onClearAll}
							className="h-9 px-2 gap-1"
						>
							<XCircleIcon className="size-4" />
							Clear
						</Button>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger
							className={cn(
								buttonVariants({ variant: 'outline', size: 'sm' }),
								'h-9 gap-2 cursor-pointer',
							)}
						>
							<ArrowsDownUpIcon className="size-4" />
							Urutkan
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56 bg-popover">
							<DropdownMenuGroup>
								<DropdownMenuLabel>Urutkan Berdasarkan</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuRadioGroup
									value={activeSortId}
									onValueChange={handleSortColumnChange}
								>
									{table
										.getAllColumns()
										.filter((column) => column.getCanSort())
										.map((column) => {
											const header = column.columnDef.header;
											const label =
												typeof header === 'string' ? header : column.id;
											return (
												<DropdownMenuRadioItem
													key={column.id}
													value={column.id}
													className="cursor-pointer"
												>
													{label}
												</DropdownMenuRadioItem>
											);
										})}
								</DropdownMenuRadioGroup>
							</DropdownMenuGroup>

							{activeSortId && (
								<DropdownMenuGroup>
									<DropdownMenuSeparator />
									<DropdownMenuLabel>Arah Urutan</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuRadioGroup
										value={activeSortDir}
										onValueChange={handleSortDirChange}
									>
										<DropdownMenuRadioItem
											value="asc"
											className="cursor-pointer"
										>
											Menaik (A-Z)
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem
											value="desc"
											className="cursor-pointer"
										>
											Menurun (Z-A)
										</DropdownMenuRadioItem>
									</DropdownMenuRadioGroup>
								</DropdownMenuGroup>
							)}
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu>
						<DropdownMenuTrigger
							className={cn(
								buttonVariants({ variant: 'outline', size: 'sm' }),
								'h-9 gap-2 cursor-pointer',
							)}
						>
							<SlidersHorizontalIcon className="size-4" />
							Kolom
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48 bg-popover">
							<DropdownMenuGroup>
								<DropdownMenuLabel>Tampilkan Kolom</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{table
									.getAllColumns()
									.filter((column) => column.getCanHide())
									.map((column) => {
										const header = column.columnDef.header;
										const label =
											typeof header === 'string' ? header : column.id;
										return (
											<DropdownMenuCheckboxItem
												key={column.id}
												className="capitalize cursor-pointer"
												checked={column.getIsVisible()}
												onCheckedChange={(value) =>
													column.toggleVisibility(!!value)
												}
											>
												{label}
											</DropdownMenuCheckboxItem>
										);
									})}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
			)}

			{/*
			 * Kartu tabel. Bingkai dan radiusnya dibiarkan ke `Table` — dulu keduanya
			 * memasang bingkai sendiri sehingga ada dua garis bertumpuk, dan
			 * `overflow-hidden` di sini memotong kotak gulir di dalamnya sehingga
			 * kolom yang tidak muat hilang diam-diam alih-alih bisa digeser.
			 */}
			<div className="bg-card">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-24 text-center text-muted-foreground"
								>
									Tidak ada data yang ditemukan.
								</TableCell>
							</TableRow>
						) : (
							table.getRowModel().rows.map((row) => (
								<TableRow key={row.id}>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id} className="py-2.5">
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Pagination Controls */}
			{showFooter && (
			// `flex-wrap` dengan alasan yang sama seperti `pagination-footer.tsx`:
			// di 360 px kedua kelompok meluber 17 px, dan yang terdorong keluar
			// layar justru tombol halaman berikutnya.
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-1">
				<div className="flex items-center gap-4 text-sm text-muted-foreground">
					<div className="flex items-center gap-2">
						<span>Tampilkan</span>
						<Select
							value={String(table.getState().pagination.pageSize)}
							onChange={(e) => {
								table.setPageSize(Number(e.target.value));
							}}
							className="w-20 h-8 py-0"
						>
							{[5, 10, 20, 30, 40, 55].map((pageSizeOption) => (
								<option key={pageSizeOption} value={String(pageSizeOption)}>
									{pageSizeOption}
								</option>
							))}
						</Select>
						<span>baris</span>
					</div>
					<span className="hidden sm:inline">
						Total {rowCount ?? table.getFilteredRowModel().rows.length} data
					</span>
				</div>

				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground mr-2">
						Halaman {table.getState().pagination.pageIndex + 1} dari{' '}
						{table.getPageCount() || 1}
					</span>
					<Button
						variant="outline"
						size="icon-sm"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
						className="size-8"
					>
						<ArrowLeftIcon className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
						className="size-8"
					>
						<ArrowRightIcon className="size-4" />
					</Button>
				</div>
			</div>
			)}
		</div>
	);
}
