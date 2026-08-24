import * as React from 'react';
import {
	ArchiveIcon,
	FolderPlusIcon,
	FolderOpenIcon,
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
import {
	jalurFolder,
	type EvidenceFolderEntity,
	type EvidenceNode,
} from '../../domain/entities/evidence-folder.entity';
import { useEvidenceLibrary } from '../hooks/use-evidence-library';
import { useEvidencePermission } from '../hooks/use-evidence-permission';
import { getEvidenceColumns } from './evidence-columns';
import { EvidenceBreadcrumb } from './evidence-breadcrumb';
import { EvidenceDetailPanel } from './evidence-detail-panel';
import { EvidenceFolderDialog } from './evidence-folder-dialog';
import { EvidenceGrid } from './evidence-grid';
import { EvidenceMoveDialog } from './evidence-move-dialog';
import { EvidenceSelectionBar } from './evidence-selection-bar';
import { EvidenceUploadDialog } from './evidence-upload-dialog';

const sortOptions = [
	{ id: 'namaDokumen', label: 'Nama' },
	{ id: 'waktuDiunggah', label: 'Waktu Unggah' },
	{ id: 'status', label: 'Status' },
	{ id: 'ukuranBytes', label: 'Ukuran' },
	{ id: 'tipeFile', label: 'Tipe Berkas' },
	{ id: 'uploadedByName', label: 'Diunggah Oleh' },
];

/** Peringatan yang sama dipakai hapus satu berkas maupun hapus folder berisi. */
const PERINGATAN_RUJUKAN =
	'Bukti dukung yang sudah dipakai di suatu bab akan kehilangan rujukannya.';

/**
 * Badan Perpustakaan Bukti Dukung, dipakai bersama oleh lapis tenant (§4.4) dan
 * lapis prodi (§5.2). Yang membedakan keduanya hanya cakupan data dan target
 * unggahan, jadi tampilannya cukup satu supaya keduanya tidak lama-lama
 * berbeda perilaku.
 *
 * Sejak §4.6a, isinya berupa **pohon**: folder dengan nama dan kedalaman bebas,
 * dijelajahi lewat remah tautan dan `?folder=` di URL. Kedua cakupan punya
 * pohonnya masing-masing dan tidak ada folder yang melintasi batasnya.
 *
 * **Yang sengaja tidak ada:**
 * - Kolom pohon di kiri. Halaman ini sudah berada di dalam sidebar `AppShell`,
 *   dan sidebar kedua membuat isinya terjepit di layar sempit — sementara remah
 *   tautan plus folder yang tampil paling depan sudah menjawab "saya di mana"
 *   dan "ke mana lagi".
 * - Tarik-lepas untuk memindahkan. Ia hanya menjangkau folder yang kebetulan
 *   sedang terlihat, tidak bisa dipakai tanpa tetikus, dan menuntut tiga sasaran
 *   jatuh yang berbeda (kartu, baris tabel, remah tautan). Dialog "Pindahkan ke…"
 *   menjawab ketiganya sekaligus.
 * - Tempat sampah. Hapus berarti hilang; yang menahan salah tekan adalah
 *   konfirmasi yang menyebut jumlahnya.
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
		cakupan,
		folderAktif,
		folders,
		jalurFolder: jalurAktif,
		pindahFolder,
		terpilih,
		alihkanPilih,
		bersihkanPilihan,
	} = useEvidenceLibrary({ level, studyProgramId });

	const [isUploadOpen, setUploadOpen] = React.useState(false);
	const [selectedId, setSelectedId] = React.useState<string | null>(null);
	/** `undefined` = dialog tertutup; `null` = membuat baru; objek = ganti nama. */
	const [folderDialog, setFolderDialog] = React.useState<
		EvidenceFolderEntity | null | undefined
	>(undefined);
	const [dipindah, setDipindah] = React.useState<EvidenceNode[] | null>(null);

	const labelAkar =
		level === 'TENANT'
			? 'Bukti Dukung Universitas'
			: `Bukti Dukung Prodi ${studyProgramName ?? ''}`.trim();

	// Dibaca ulang dari daftar supaya panel detail ikut memperbarui statusnya
	// saat ingestion selesai selagi panel terbuka.
	const selected = React.useMemo(() => {
		const node = items.find(
			(baris) => baris.tipe === 'BERKAS' && baris.id === selectedId,
		);
		return node?.tipe === 'BERKAS' ? node.evidence : null;
	}, [items, selectedId]);

	const handleDelete = React.useCallback((evidence: EvidenceEntity) => {
		if (
			!confirm(`Hapus "${evidence.namaDokumen}"? ${PERINGATAN_RUJUKAN}`)
		) {
			return;
		}
		evidenceRepository.delete(evidence.id);
		setSelectedId(null);
	}, []);

	const handleRetry = React.useCallback((evidence: EvidenceEntity) => {
		evidenceRepository.retryIngestion(evidence.id);
	}, []);

	/**
	 * Konfirmasi hapus folder menyebut angka pastinya sebelum apa pun dihapus —
	 * itulah satu-satunya penahan, karena tidak ada tempat sampah untuk memulihkan.
	 */
	const handleHapusFolder = React.useCallback((node: EvidenceNode) => {
		if (node.tipe !== 'FOLDER') return;

		const rincian = evidenceRepository.rincianHapusFolder(node.id);
		const isi = [
			rincian.subfolder > 0 && `${rincian.subfolder} subfolder`,
			rincian.berkas > 0 && `${rincian.berkas} berkas`,
		]
			.filter(Boolean)
			.join(' dan ');

		const pesan = isi
			? `Hapus folder "${node.folder.nama}" beserta ${isi} di dalamnya?\n\n${PERINGATAN_RUJUKAN}`
			: `Hapus folder "${node.folder.nama}"? Folder ini kosong.`;

		if (!confirm(pesan)) return;
		evidenceRepository.deleteFolderCascade(node.id);
	}, []);

	const nodeTerpilih = React.useMemo(
		() => items.filter((node) => terpilih.has(node.id)),
		[items, terpilih],
	);

	/**
	 * Hak hapus melekat per berkas — Penyusun hanya boleh membuang unggahannya
	 * sendiri — jadi seleksi campuran tidak punya jawaban tunggal, dan menghapus
	 * sebagiannya diam-diam adalah hasil yang tidak diminta siapa pun.
	 */
	const bolehHapusSemua =
		nodeTerpilih.length > 0 &&
		nodeTerpilih.every((node) =>
			node.tipe === 'FOLDER'
				? permission.canManage
				: permission.canDelete(node.evidence),
		);

	const handleHapusMassal = () => {
		const folderDihapus = nodeTerpilih.filter((node) => node.tipe === 'FOLDER');
		const berkasDihapus = nodeTerpilih.filter((node) => node.tipe === 'BERKAS');

		// Isi folder dihitung lebih dulu supaya angkanya bisa disebut sebelum ada
		// yang benar-benar dihapus.
		let subfolder = 0;
		let berkasIkut = 0;
		for (const node of folderDihapus) {
			const rincian = evidenceRepository.rincianHapusFolder(node.id);
			subfolder += rincian.subfolder;
			berkasIkut += rincian.berkas;
		}

		const bagian = [
			folderDihapus.length > 0 && `${folderDihapus.length} folder`,
			berkasDihapus.length > 0 && `${berkasDihapus.length} berkas`,
		]
			.filter(Boolean)
			.join(' dan ');

		const ikut = [
			subfolder > 0 && `${subfolder} subfolder`,
			berkasIkut > 0 && `${berkasIkut} berkas`,
		]
			.filter(Boolean)
			.join(' dan ');

		const pesan = ikut
			? `Hapus ${bagian}? Ikut terhapus ${ikut} di dalam foldernya.\n\n${PERINGATAN_RUJUKAN}`
			: `Hapus ${bagian}?\n\n${PERINGATAN_RUJUKAN}`;

		if (!confirm(pesan)) return;

		for (const node of berkasDihapus) evidenceRepository.delete(node.id);
		for (const node of folderDihapus) {
			evidenceRepository.deleteFolderCascade(node.id);
		}
		bersihkanPilihan();
	};

	const handlePilihSemua = (aktif: boolean) => {
		if (!aktif) {
			bersihkanPilihan();
			return;
		}
		for (const node of items) alihkanPilih(node.id, true);
	};

	const columns = React.useMemo(
		() =>
			getEvidenceColumns({
				showOwner: level === 'TENANT',
				canManage: permission.canManage,
				canDelete: permission.canDelete,
				canRetry: permission.canRetry,
				terpilih,
				onPilih: alihkanPilih,
				onPilihSemua: handlePilihSemua,
				onBukaFolder: pindahFolder,
				onOpen: (evidence) => setSelectedId(evidence.id),
				onDelete: handleDelete,
				onRetry: handleRetry,
				onGantiNama: (node) => {
					if (node.tipe === 'FOLDER') setFolderDialog(node.folder);
				},
				onPindahkan: (node) => setDipindah([node]),
				onHapusFolder: handleHapusFolder,
			}),
		// `handlePilihSemua` sengaja tidak masuk daftar: ia dirakit ulang tiap
		// render dan hanya membaca `items`, yang sudah memicu perakitan ulang lewat
		// `terpilih` setiap kali isinya berubah.
		[
			level,
			permission.canManage,
			permission.canDelete,
			permission.canRetry,
			terpilih,
			alihkanPilih,
			pindahFolder,
			handleDelete,
			handleRetry,
			handleHapusFolder,
			items,
		],
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

	const toolbarActions = (
		<>
			{permission.canManage && (
				<Button
					variant="outline"
					onClick={() => setFolderDialog(null)}
					className="gap-2 cursor-pointer"
				>
					<FolderPlusIcon className="size-4" />
					Folder Baru
				</Button>
			)}
			{uploadButton}
		</>
	);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="font-heading text-2xl font-bold tracking-tight">
					{labelAkar}
				</h2>
				<p className="text-sm text-muted-foreground">
					{level === 'TENANT'
						? 'Berkas milik universitas yang bisa dipakai seluruh prodi. Unggahan di sini juga bisa diarahkan ke prodi tertentu.'
						: 'Tidak terikat ke satu Dokumen LED, jadi otomatis tersedia untuk semua dokumen milik prodi ini.'}
				</p>
			</div>

			<EvidenceBreadcrumb
				labelAkar={labelAkar}
				jalur={jalurAktif}
				mencari={isSearching}
				onPindah={pindahFolder}
			/>

			<CollectionToolbar
				searchValue={globalFilter}
				onSearchChange={setGlobalFilter}
				searchPlaceholder="Cari di seluruh perpustakaan..."
				sortOptions={sortOptions}
				activeSortId={activeSortId}
				activeSortDir={activeSortDir}
				onSortChange={(id, dir) => setSorting([{ id, desc: dir === 'desc' }])}
				onClearAll={clearAll}
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				actions={toolbarActions}
			/>

			<EvidenceSelectionBar
				jumlah={nodeTerpilih.length}
				bolehHapus={bolehHapusSemua}
				alasanTakBolehHapus="Sebagian pilihan bukan unggahan Anda"
				onPindahkan={() => setDipindah(nodeTerpilih)}
				onHapus={handleHapusMassal}
				onBersihkan={bersihkanPilihan}
			/>

			{total === 0 ? (
				<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
					{isSearching ? (
						<>
							<MagnifyingGlassIcon className="size-8 text-muted-foreground" />
							<p className="font-medium">Tidak ada yang cocok</p>
							<p className="max-w-sm text-sm text-muted-foreground">
								Pencarian sudah menjangkau seluruh folder di perpustakaan ini.
								Coba kata kunci lain, atau bersihkan pencarian.
							</p>
							<Button
								variant="outline"
								onClick={clearAll}
								className="cursor-pointer"
							>
								Bersihkan pencarian
							</Button>
						</>
					) : folderAktif !== null ? (
						/*
						 * Keadaan kosong yang ketiga, dan ia perlu dibedakan: folder kosong
						 * yang menampilkan ajakan "belum ada bukti dukung" terbaca seolah
						 * seluruh perpustakaan kosong, padahal isinya cuma ada di cabang
						 * sebelah.
						 */
						<>
							<FolderOpenIcon className="size-8 text-muted-foreground" />
							<p className="font-medium">Folder ini masih kosong</p>
							<p className="max-w-sm text-sm text-muted-foreground">
								Unggah berkas ke sini, atau pindahkan yang sudah ada dari folder
								lain.
							</p>
							{uploadButton}
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
						canManage={permission.canManage}
						canDelete={permission.canDelete}
						canRetry={permission.canRetry}
						terpilih={terpilih}
						onPilih={alihkanPilih}
						onBukaFolder={pindahFolder}
						onOpen={(evidence) => setSelectedId(evidence.id)}
						onDelete={handleDelete}
						onRetry={handleRetry}
						onGantiNama={(node) => {
							if (node.tipe === 'FOLDER') setFolderDialog(node.folder);
						}}
						onPindahkan={(node) => setDipindah([node])}
						onHapusFolder={handleHapusFolder}
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
					cakupan={cakupan}
					folderAktif={folderAktif}
					labelAkar={labelAkar}
					uploader={{
						userId: permission.session.userId,
						name: permission.session.namaLengkap,
					}}
				/>
			)}

			{permission.canManage && permission.session && (
				<EvidenceFolderDialog
					open={folderDialog !== undefined}
					onOpenChange={(open) => {
						if (!open) setFolderDialog(undefined);
					}}
					cakupan={cakupan}
					parentId={folderAktif}
					folder={folderDialog ?? null}
					pembuat={{
						userId: permission.session.userId,
						nama: permission.session.namaLengkap,
					}}
				/>
			)}

			{permission.canManage && dipindah !== null && (
				<EvidenceMoveDialog
					open
					onOpenChange={(open) => {
						if (!open) setDipindah(null);
					}}
					node={dipindah}
					folders={folders}
					labelAkar={labelAkar}
					folderAsal={folderAktif}
					onSelesai={bersihkanPilihan}
				/>
			)}

			{/*
			 * Jalur yang ditampilkan panel detail adalah jalur **berkasnya sendiri**,
			 * bukan folder yang sedang dibuka: di mode pencarian keduanya berbeda,
			 * dan justru di sanalah pertanyaan "berkas ini sebenarnya di mana"
			 * muncul.
			 */}
			<EvidenceDetailPanel
				evidence={selected}
				folderJalur={
					selected
						? jalurFolder(folders, selected.folderId).map(
								(folder) => folder.nama,
							)
						: []
				}
				canDelete={selected ? permission.canDelete(selected) : false}
				canRetry={selected ? permission.canRetry(selected) : false}
				onClose={() => setSelectedId(null)}
				onDelete={handleDelete}
				onRetry={handleRetry}
			/>
		</div>
	);
}
