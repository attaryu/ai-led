import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Select } from '~/core/components/ui/select';

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 40, 55];

/**
 * Footer paginasi untuk daftar yang tidak dirender sebagai tabel.
 *
 * Bentuknya sengaja disamakan dengan footer bawaan `DataTable` supaya berpindah
 * antara tampilan kartu dan tabel tidak terasa seperti pindah halaman.
 */
export function PaginationFooter({
	pageIndex,
	pageSize,
	total,
	onPageChange,
	onPageSizeChange,
}: {
	pageIndex: number;
	pageSize: number;
	total: number;
	onPageChange: (pageIndex: number) => void;
	onPageSizeChange: (pageSize: number) => void;
}) {
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const canPrevious = pageIndex > 0;
	const canNext = pageIndex + 1 < pageCount;

	return (
		// `flex-wrap` + `gap-y`: di 360 px kedua kelompok tidak muat berdampingan
		// (meluber 17 px), dan yang terpotong justru tombol halaman berikutnya —
		// satu-satunya cara maju di daftar yang panjang. Turun ke baris kedua jauh
		// lebih baik daripada hilang di luar layar.
		<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-1">
			<div className="flex items-center gap-4 text-sm text-muted-foreground">
				<div className="flex items-center gap-2">
					<span>Tampilkan</span>
					<Select
						value={String(pageSize)}
						onChange={(event) => onPageSizeChange(Number(event.target.value))}
						className="h-8 w-20 py-0"
					>
						{PAGE_SIZE_OPTIONS.map((option) => (
							<option key={option} value={String(option)}>
								{option}
							</option>
						))}
					</Select>
					<span>baris</span>
				</div>
				<span className="hidden sm:inline">Total {total} data</span>
			</div>

			<div className="flex items-center gap-2">
				<span className="mr-2 text-sm text-muted-foreground">
					Halaman {pageIndex + 1} dari {pageCount}
				</span>
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => onPageChange(pageIndex - 1)}
					disabled={!canPrevious}
					className="size-8"
				>
					<ArrowLeftIcon className="size-4" />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => onPageChange(pageIndex + 1)}
					disabled={!canNext}
					className="size-8"
				>
					<ArrowRightIcon className="size-4" />
				</Button>
			</div>
		</div>
	);
}
