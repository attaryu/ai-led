import * as React from 'react';
import {
	ArrowsDownUpIcon,
	SquaresFourIcon,
	RowsIcon,
	XCircleIcon,
} from '@phosphor-icons/react';

import { Button, buttonVariants } from '~/core/components/ui/button';
import { Input } from '~/core/components/ui/input';
import { cn } from '~/core/lib/utils';
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuGroup,
} from '~/core/components/ui/dropdown-menu';

export type CollectionSortOption = { id: string; label: string };

export type CollectionViewMode = 'grid' | 'table';

/**
 * Toolbar daftar yang tidak terikat ke tabel.
 *
 * `DataTable` punya toolbar sendiri di dalamnya, tapi tampilan grid butuh
 * kontrol yang sama persis — jadi pencarian, pengurutan, dan tombol bersih
 * diangkat ke sini supaya kedua mode tampilan memakai satu perilaku yang sama,
 * bukan dua salinan yang lama-lama berbeda.
 */
export function CollectionToolbar({
	searchValue,
	onSearchChange,
	searchPlaceholder = 'Cari data...',
	sortOptions,
	activeSortId,
	activeSortDir,
	onSortChange,
	onClearAll,
	viewMode,
	onViewModeChange,
	actions,
}: {
	searchValue: string;
	onSearchChange: (value: string) => void;
	searchPlaceholder?: string;
	sortOptions: CollectionSortOption[];
	activeSortId: string;
	activeSortDir: 'asc' | 'desc' | '';
	onSortChange: (id: string, dir: 'asc' | 'desc') => void;
	onClearAll: () => void;
	/** Tidak diisi → tombol ganti tampilan tidak dirender. */
	viewMode?: CollectionViewMode;
	onViewModeChange?: (mode: CollectionViewMode) => void;
	actions?: React.ReactNode;
}) {
	const hasActiveFilters = searchValue !== '' || activeSortId !== '';

	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div className="flex min-w-[240px] max-w-sm flex-1 items-center gap-2">
				<Input
					placeholder={searchPlaceholder}
					value={searchValue}
					onChange={(event) => onSearchChange(event.target.value)}
					className="h-9"
				/>
			</div>

			{/*
			 * `flex-wrap`, bukan satu baris kaku: jumlah tombol di sini ditentukan
			 * pemanggilnya lewat `actions`, dan Perpustakaan Bukti Dukung sekarang
			 * menyumbang dua. Tanpa ini deretannya meluber keluar layar di lebar
			 * sempit alih-alih turun ke baris berikutnya.
			 */}
			<div className="flex flex-wrap items-center justify-end gap-2">
				{hasActiveFilters && (
					<Button
						variant="outline"
						size="sm"
						onClick={onClearAll}
						className="h-9 gap-1 px-2 cursor-pointer"
					>
						<XCircleIcon className="size-4" />
						Bersihkan
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
								onValueChange={(id) =>
									onSortChange(id, activeSortDir === 'desc' ? 'desc' : 'asc')
								}
							>
								{sortOptions.map((option) => (
									<DropdownMenuRadioItem
										key={option.id}
										value={option.id}
										className="cursor-pointer"
									>
										{option.label}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuGroup>

						{activeSortId && (
							<DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuLabel>Arah Urutan</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuRadioGroup
									value={activeSortDir}
									onValueChange={(dir) =>
										onSortChange(activeSortId, dir as 'asc' | 'desc')
									}
								>
									<DropdownMenuRadioItem value="asc" className="cursor-pointer">
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

				{viewMode && onViewModeChange && (
					<div className="flex items-center rounded-md border border-border p-0.5">
						<button
							type="button"
							onClick={() => onViewModeChange('grid')}
							aria-label="Tampilan kartu"
							aria-pressed={viewMode === 'grid'}
							className={cn(
								'flex size-8 cursor-pointer items-center justify-center rounded-sm transition-colors',
								viewMode === 'grid'
									? 'bg-primary text-primary-foreground'
									: 'text-muted-foreground hover:bg-accent',
							)}
						>
							<SquaresFourIcon className="size-4" />
						</button>
						<button
							type="button"
							onClick={() => onViewModeChange('table')}
							aria-label="Tampilan tabel"
							aria-pressed={viewMode === 'table'}
							className={cn(
								'flex size-8 cursor-pointer items-center justify-center rounded-sm transition-colors',
								viewMode === 'table'
									? 'bg-primary text-primary-foreground'
									: 'text-muted-foreground hover:bg-accent',
							)}
						>
							<RowsIcon className="size-4" />
						</button>
					</div>
				)}

				{actions}
			</div>
		</div>
	);
}
