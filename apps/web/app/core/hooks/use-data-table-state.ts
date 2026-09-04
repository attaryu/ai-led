import * as React from 'react';
import { useSearchParams } from 'react-router';
import type {
	SortingState,
	Updater,
	VisibilityState,
} from '@tanstack/react-table';

export function useDataTableState(key: string) {
	const [searchParams, setSearchParams] = useSearchParams();

	// Parse Sorting State
	const sort = searchParams.get('sort');
	const dir = searchParams.get('dir');
	const sorting: SortingState =
		sort && dir ? [{ id: sort, desc: dir === 'desc' }] : [];

	// Parse Search Filter
	const globalFilter = searchParams.get('q') ?? '';

	// Parse Pagination State
	const pageIndex = Number(searchParams.get('page') ?? '1') - 1;
	const pageSize = Number(searchParams.get('limit') ?? '10');

	// Parse Column Visibility from localStorage
	const storageKey = `table_visibility_${key}`;
	const [columnVisibility, setColumnVisibilityState] =
		React.useState<VisibilityState>(() => {
			if (typeof window === 'undefined') return {};

			try {
				const raw = localStorage.getItem(storageKey);
				return raw ? JSON.parse(raw) : {};
			} catch {
				return {};
			}
		});

	// Set Column Visibility
	const setColumnVisibility = React.useCallback(
		(updaterOrValue: Updater<VisibilityState>) => {
			setColumnVisibilityState((prev) => {
				const next =
					typeof updaterOrValue === 'function'
						? updaterOrValue(prev)
						: updaterOrValue;

				try {
					localStorage.setItem(storageKey, JSON.stringify(next));
				} catch {}

				return next;
			});
		},
		[storageKey],
	);

	// Set Sorting (Stable Reference)
	const setSorting = React.useCallback(
		(updaterOrValue: Updater<SortingState>) => {
			setSearchParams((prev) => {
				let currentSorting: SortingState = [];
				const currentSort = prev.get('sort');
				const currentDir = prev.get('dir');

				if (currentSort && currentDir) {
					currentSorting = [{ id: currentSort, desc: currentDir === 'desc' }];
				}

				const nextSorting =
					typeof updaterOrValue === 'function'
						? updaterOrValue(currentSorting)
						: updaterOrValue;

				if (nextSorting.length > 0) {
					prev.set('sort', nextSorting[0].id);
					prev.set('dir', nextSorting[0].desc ? 'desc' : 'asc');
				} else {
					prev.delete('sort');
					prev.delete('dir');
				}

				// Reset ke halaman 1 saat sorting berubah
				prev.set('page', '1');
				return prev;
			});
		},
		[setSearchParams],
	);

	// Set Search Filter (Stable Reference)
	const setGlobalFilter = React.useCallback(
		(value: string) => {
			setSearchParams((prev) => {
				if (value) {
					prev.set('q', value);
				} else {
					prev.delete('q');
				}

				// Reset ke halaman 1 saat search berubah
				prev.set('page', '1');
				return prev;
			});
		},
		[setSearchParams],
	);

	// Set Pagination (Stable Reference)
	const setPagination = React.useCallback(
		(updaterOrValue: Updater<{ pageIndex: number; pageSize: number }>) => {
			setSearchParams((prev) => {
				const currentPageIndex = Number(prev.get('page') ?? '1') - 1;
				const currentPageSize = Number(prev.get('limit') ?? '10');
				const nextPagination =
					typeof updaterOrValue === 'function'
						? updaterOrValue({
								pageIndex: currentPageIndex,
								pageSize: currentPageSize,
							})
						: updaterOrValue;

				prev.set('page', String(nextPagination.pageIndex + 1));
				prev.set('limit', String(nextPagination.pageSize));

				return prev;
			});
		},
		[setSearchParams],
	);

	// Clear All Filters (Search, Sort, Pagination) (Stable Reference)
	const clearAll = React.useCallback(() => {
		setSearchParams((prev) => {
			prev.delete('q');
			prev.delete('sort');
			prev.delete('dir');
			prev.set('page', '1');
			return prev;
		});
	}, [setSearchParams]);

	return {
		sorting,
		setSorting,
		globalFilter,
		setGlobalFilter,
		pagination: { pageIndex, pageSize },
		setPagination,
		columnVisibility,
		setColumnVisibility,
		clearAll,
	};
}
