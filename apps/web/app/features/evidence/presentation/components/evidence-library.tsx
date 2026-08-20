import * as React from 'react';
import {
	ArchiveIcon,
	MagnifyingGlassIcon,
	UploadSimpleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { CollectionToolbar } from '~/core/components/ui/collection-toolbar';
import { DataTable } from '~/core/components/ui/data-table';
import { PaginationFooter } from '~/core/components/ui/pagination-footer';
import { evidenceRepository } from '../../data/repositories/evidence.repository';
import {
	type EvidenceEntity,
	type EvidenceOwnerType,
} from '../../domain/entities/evidence.entity';
import { useEvidenceLibrary } from '../hooks/use-evidence-library';
import { useEvidencePermission } from '../hooks/use-evidence-permission';
import { getEvidenceColumns } from './evidence-columns';
import { EvidenceDetailPanel } from './evidence-detail-panel';
import { EvidenceGrid } from './evidence-grid';
import { EvidenceUploadDialog } from './evidence-upload-dialog';

const sortOptions = [
	{ id: 'namaDokumen', label: 'Nama Dokumen' },
	{ id: 'waktuDiunggah', label: 'Waktu Unggah' },
	{ id: 'status', label: 'Status' },
	{ id: 'ukuranBytes', label: 'Ukuran' },
	{ id: 'tipeFile', label: 'Tipe Berkas' },
	{ id: 'uploadedByName', label: 'Diunggah Oleh' },
];

/**
 * Badan Perpustakaan Bukti Dukung, dipakai bersama oleh lapis tenant (§4.4) dan
 * lapis prodi (§5.2). Yang membedakan keduanya hanya cakupan data dan target
 * unggahan, jadi tampilannya cukup satu supaya keduanya tidak lama-lama
 * berbeda perilaku.
 */
export function EvidenceLibrary({
	level,
	studyProgramId,
	studyProgramName,
}: {
	level: EvidenceOwnerType;
	studyProgramId?: string;
	studyProgramName?: string;
}) {
	const permission = useEvidencePermission(level, studyProgramId);
	const {
		items,
		total,
		viewMode,
		setViewMode,
		sorting,
		setSorting,
		globalFilter,
		setGlobalFilter,
		pagination,
		setPagination,
		columnVisibility,
		setColumnVisibility,
		clearAll,
	} = useEvidenceLibrary({ level, studyProgramId });

	const [isUploadOpen, setUploadOpen] = React.useState(false);
	const [selectedId, setSelectedId] = React.useState<string | null>(null);

	// Dibaca ulang dari daftar supaya panel detail ikut memperbarui statusnya
	// saat ingestion selesai selagi panel terbuka.
	const selected = React.useMemo(
		() => items.find((item) => item.id === selectedId) ?? null,
		[items, selectedId],
	);

	const handleDelete = React.useCallback((evidence: EvidenceEntity) => {
		if (
			!confirm(
				`Hapus "${evidence.namaDokumen}"? Bukti dukung yang sudah dipakai di suatu bab akan kehilangan rujukannya.`,
			)
		) {
			return;
		}
		setSelectedId(null);
		evidenceRepository.delete(evidence.id).catch((error: unknown) => {
			alert(error instanceof Error ? error.message : 'Gagal menghapus berkas.');
		});
	}, []);

	const handleRetry = React.useCallback((evidence: EvidenceEntity) => {
		evidenceRepository.retryIngestion(evidence.id).catch((error: unknown) => {
			alert(error instanceof Error ? error.message : 'Coba proses ulang gagal.');
		});
	}, []);

	const columns = React.useMemo(
		() =>
			getEvidenceColumns({
				showOwner: level === 'TENANT',
				canDelete: permission.canDelete,
				canRetry: permission.canRetry,
				onOpen: (evidence) => setSelectedId(evidence.id),
				onDelete: handleDelete,
				onRetry: handleRetry,
			}),
		[level, permission.canDelete, permission.canRetry, handleDelete, handleRetry],
	);

	const activeSortId = sorting[0]?.id ?? '';
	const activeSortDir = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : '';
	const isSearching = globalFilter.trim() !== '';

	const uploadButton = permission.canUpload && (
		<Button onClick={() => setUploadOpen(true)} className="gap-2 cursor-pointer">
			<UploadSimpleIcon className="size-4" />
			Unggah Bukti Dukung
		</Button>
	);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="font-heading text-2xl font-bold tracking-tight">
					{level === 'TENANT'
						? 'Bukti Dukung Universitas'
						: `Bukti Dukung Prodi ${studyProgramName ?? ''}`}
				</h2>
				<p className="text-sm text-muted-foreground">
					{level === 'TENANT'
						? 'Berkas milik universitas yang bisa dipakai seluruh prodi. Unggahan di sini juga bisa diarahkan ke prodi tertentu.'
						: 'Tidak terikat ke satu Dokumen LED, jadi otomatis tersedia untuk semua dokumen milik prodi ini.'}
				</p>
			</div>

			<CollectionToolbar
				searchValue={globalFilter}
				onSearchChange={setGlobalFilter}
				searchPlaceholder="Cari nama berkas, pengunggah, atau tipe..."
				sortOptions={sortOptions}
				activeSortId={activeSortId}
				activeSortDir={activeSortDir}
				onSortChange={(id, dir) => setSorting([{ id, desc: dir === 'desc' }])}
				onClearAll={clearAll}
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				actions={uploadButton}
			/>

			{total === 0 ? (
				<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
					{isSearching ? (
						<>
							<MagnifyingGlassIcon className="size-8 text-muted-foreground" />
							<p className="font-medium">Tidak ada berkas yang cocok</p>
							<p className="max-w-sm text-sm text-muted-foreground">
								Coba kata kunci lain, atau bersihkan pencarian untuk melihat
								seluruh bukti dukung.
							</p>
							<Button
								variant="outline"
								onClick={clearAll}
								className="cursor-pointer"
							>
								Bersihkan pencarian
							</Button>
						</>
					) : (
						<>
							<ArchiveIcon className="size-8 text-muted-foreground" />
							<p className="font-medium">Belum ada bukti dukung</p>
							<p className="max-w-sm text-sm text-muted-foreground">
								Unggah SK, sertifikat, laporan kegiatan, atau LKPS supaya bisa
								dipakai sebagai konteks saat menyusun narasi bab.
							</p>
							{uploadButton}
						</>
					)}
				</div>
			) : viewMode === 'grid' ? (
				<>
					<EvidenceGrid
						items={items}
						showOwner={level === 'TENANT'}
						canDelete={permission.canDelete}
						canRetry={permission.canRetry}
						onOpen={(evidence) => setSelectedId(evidence.id)}
						onDelete={handleDelete}
						onRetry={handleRetry}
					/>
					<PaginationFooter
						pageIndex={pagination.pageIndex}
						pageSize={pagination.pageSize}
						total={total}
						onPageChange={(pageIndex) =>
							setPagination({ ...pagination, pageIndex })
						}
						onPageSizeChange={(pageSize) =>
							setPagination({ pageIndex: 0, pageSize })
						}
					/>
				</>
			) : (
				<DataTable
					columns={columns}
					data={items}
					rowCount={total}
					showToolbar={false}
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
			)}

			{permission.canUpload && permission.session && (
				<EvidenceUploadDialog
					open={isUploadOpen}
					onOpenChange={setUploadOpen}
					level={level}
					studyProgramId={studyProgramId}
					studyProgramName={studyProgramName}
					uploader={{
						userId: permission.session.userId,
						name: permission.session.namaLengkap,
					}}
				/>
			)}

			<EvidenceDetailPanel
				evidence={selected}
				canDelete={selected ? permission.canDelete(selected) : false}
				canRetry={selected ? permission.canRetry(selected) : false}
				onClose={() => setSelectedId(null)}
				onDelete={handleDelete}
				onRetry={handleRetry}
			/>
		</div>
	);
}
