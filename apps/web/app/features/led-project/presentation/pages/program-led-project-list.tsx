import * as React from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import { PlusIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { useConfirmDialog } from '~/core/components/ui/confirm-dialog';
import { DataTable } from '~/core/components/ui/data-table';
import { useDataTableState } from '~/core/hooks/use-data-table-state';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { type StudyProgramEntity } from '~/features/study-program/domain/entities/study-program.entity';
import { ledProjectRepository } from '../../data/repositories/led-project.repository';
import { getLedProjectColumns } from '../components/led-project-columns';
import { type LedProjectPage } from '../../domain/dtos/led-project-query.dto';

/**
 * Daftar Dokumen LED milik satu prodi (docs/application_flow.md §5.3).
 *
 * Kembaran dari daftar lintas program studi di lapis tenant, dipersempit ke
 * `:programId` di URL. Dua kolomnya berbeda karena konteksnya berbeda: nama
 * prodi dibuang (seluruh baris memuat nilai yang sama), tenggat ditambahkan
 * supaya dokumen yang tersendat terbaca tanpa dibuka satu per satu.
 *
 * Dashboard Program Studi (§5.1c) memang sudah memuat riwayat, tapi ringkas: lima baris
 * teratas, empat kolom, tanpa perkakas. Halaman inilah daftar penuhnya, dan
 * tautan "Lihat semua" di dashboard bermuara ke sini.
 */
export function ProgramLedProjectList() {
	const navigate = useNavigate();
	const session = useSession();
	const { programId } = useParams<{ programId: string }>();
	const { konfirmasi, confirmDialog } = useConfirmDialog();

	// Penyusunan Dokumen LED sepenuhnya wewenang Penjamin Mutu; Pimpinan read-only
	// di level ini (§6.2) dan Penyusun tidak pernah punya aksi di sini (§15).
	const canManage = session?.role === 'Penjamin Mutu';

	// Diambil layout lapis prodi (`StudyProgramWorkspaceLayout`), bukan lookup
	// terpisah — datanya sudah tersedia begitu halaman ini dirender.
	const studyProgram = useOutletContext<StudyProgramEntity>();

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
	} = useDataTableState('program-led-projects');

	const [page, setPage] = React.useState<LedProjectPage>({
		items: [],
		total: 0,
	});

	/*
	 * Dijabarkan jadi nilai sederhana lebih dulu: `useDataTableState` membangun
	 * `sorting` dan `pagination` dari query string setiap render, sehingga
	 * memakainya langsung sebagai dependensi berarti efek di bawah berjalan tiap
	 * render dan halaman terjebak memuat ulang tanpa henti.
	 */
	const sortId = sorting[0]?.id;
	const sortDir = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;
	const { pageIndex, pageSize } = pagination;

	/*
	 * `DataTable` berjalan dalam mode manual, jadi penyaringan sampai pemotongan
	 * halaman dikerjakan repository (§4.6) — halaman hanya menerima satu halaman
	 * data beserta jumlah totalnya.
	 */
	const loadData = React.useCallback(async () => {
		if (!programId) return;
		setPage(
			await ledProjectRepository.findPaged({
				studyProgramId: programId,
				q: globalFilter || undefined,
				sort: sortId,
				dir: sortDir,
				page: pageIndex + 1,
				limit: pageSize,
			}),
		);
	}, [programId, globalFilter, sortId, sortDir, pageIndex, pageSize]);

	React.useEffect(() => {
		void loadData();
		window.addEventListener('storage-update', loadData);
		return () => {
			window.removeEventListener('storage-update', loadData);
		};
	}, [loadData]);

	/** Dibawa formulir supaya Batal dan simpan memulangkan ke daftar ini. */
	const returnTo = `/study-programs/${programId}/led-projects`;

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

			// `delete()` menyiarkan 'storage-update' sendiri setelah selesai.
			ledProjectRepository.delete(id).catch((e: unknown) => {
				alert(e instanceof Error ? e.message : 'Gagal menghapus Dokumen LED.');
			});
		},
		[konfirmasi],
	);

	const handleEdit = React.useCallback(
		(id: string) => {
			navigate(
				`/dashboard/led-projects/${id}/edit?returnTo=${encodeURIComponent(returnTo)}`,
			);
		},
		[navigate, returnTo],
	);

	const tableMeta = React.useMemo(
		() => ({ onDelete: handleDelete, onEdit: handleEdit }),
		[handleDelete, handleEdit],
	);

	const columns = React.useMemo(
		() =>
			getLedProjectColumns({
				withActions: canManage,
				withStudyProgram: false,
				withTenggat: true,
			}),
		[canManage],
	);

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Dokumen LED
					</h2>
					<p className="text-sm text-muted-foreground">
						Satu dokumen per tahun akademik, termasuk yang sudah selesai.
					</p>
				</div>
				{canManage && (
					<Button
						onClick={() =>
							navigate(
								`/dashboard/led-projects/create?studyProgramId=${programId}&returnTo=${encodeURIComponent(returnTo)}`,
							)
						}
						className="gap-2 cursor-pointer"
					>
						<PlusIcon className="size-4" />
						Tambah Dokumen LED
					</Button>
				)}
			</div>

			<DataTable
				columns={columns}
				data={page.items}
				rowCount={page.total}
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
