import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import {
	ArrowClockwiseIcon,
	ArrowsOutCardinalIcon,
	FolderIcon,
	InfoIcon,
	PencilSimpleIcon,
	TrashIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Checkbox } from '~/core/components/ui/checkbox';
import { cn } from '~/core/lib/utils';
import { type EvidenceEntity } from '../../domain/entities/evidence.entity';
import { type EvidenceNode } from '../../domain/entities/evidence-folder.entity';
import { formatRelativeTime } from '~/core/lib/format-time';
import { formatBytes, getFileVisual } from '../utils/evidence-format';
import { EvidenceStatusBadge } from './evidence-status-badge';

const columnHelper = createColumnHelper<EvidenceNode>();

/** Yang dirender kolom saat barisnya folder dan kolom itu memang tak berlaku. */
const KOSONG = <span className="text-muted-foreground">—</span>;

/**
 * Kolom tabel bukti dukung. `id` tiap kolom sengaja sama dengan kunci pengurutan
 * yang dikenali `evidenceRepository.findPaged`, karena pengurutan dilakukan di
 * sumber data (mode manual), bukan di dalam tabel.
 *
 * **Barisnya {@link EvidenceNode}, jadi tiap sel bercabang dua.** Sebagian kolom
 * memang tidak berlaku bagi folder — ukuran, tipe, status ekstraksi — dan
 * diisi tanda pisah alih-alih angka karangan. Yang berlaku bagi keduanya
 * (pengunggah, waktu) mengambil padanannya di sisi folder, sehingga tabelnya
 * tetap terbaca sebagai satu daftar.
 *
 * **Seleksi ikut ditutup di sini, bukan lewat `rowSelection` milik TanStack.**
 * Tampilan kartu memakai seleksi yang sama persis, jadi sumbernya harus satu —
 * `terpilih` di `useEvidenceLibrary`. Menyalakan seleksi bawaan tabel berarti dua
 * keadaan yang harus dijaga tetap sama, dan `core/ui/data-table.tsx` yang dipakai
 * empat tabel lain tidak perlu ikut berubah sama sekali.
 */
export const getEvidenceColumns = ({
	showOwner,
	canManage,
	canDelete,
	canRetry,
	terpilih,
	onPilih,
	onPilihSemua,
	onBukaFolder,
	onOpen,
	onDelete,
	onRetry,
	onGantiNama,
	onPindahkan,
	onHapusFolder,
}: {
	showOwner: boolean;
	/** Boleh membuat/menata folder — menyalakan kolom centang dan aksi folder. */
	canManage: boolean;
	canDelete: (evidence: EvidenceEntity) => boolean;
	canRetry: (evidence: EvidenceEntity) => boolean;
	terpilih: Set<string>;
	onPilih: (id: string, aktif: boolean) => void;
	/** Mencentang/melepas seluruh baris di halaman yang sedang tampil. */
	onPilihSemua: (aktif: boolean) => void;
	onBukaFolder: (id: string) => void;
	onOpen: (evidence: EvidenceEntity) => void;
	onDelete: (evidence: EvidenceEntity) => void;
	onRetry: (evidence: EvidenceEntity) => void;
	onGantiNama: (node: EvidenceNode) => void;
	onPindahkan: (node: EvidenceNode) => void;
	onHapusFolder: (node: EvidenceNode) => void;
}): ColumnDef<EvidenceNode, any>[] => [
	...(canManage
		? [
				columnHelper.display({
					id: 'pilih',
					enableHiding: false,
					header: (props) => {
						const baris = props.table.getRowModel().rows;
						const semua =
							baris.length > 0 &&
							baris.every((row) => terpilih.has(row.original.id));

						return (
							<Checkbox
								checked={semua}
								onCheckedChange={(nilai) => onPilihSemua(nilai === true)}
								aria-label="Pilih semua di halaman ini"
								className="cursor-pointer"
							/>
						);
					},
					cell: (props) => {
						const node = props.row.original;
						return (
							<Checkbox
								checked={terpilih.has(node.id)}
								onCheckedChange={(nilai) => onPilih(node.id, nilai === true)}
								aria-label={`Pilih ${namaNode(node)}`}
								className="cursor-pointer"
							/>
						);
					},
				}),
			]
		: []),
	columnHelper.accessor((node) => namaNode(node), {
		id: 'namaDokumen',
		header: 'Nama',
		enableSorting: true,
		cell: (info) => {
			const node = info.row.original;

			if (node.tipe === 'FOLDER') {
				return (
					<button
						type="button"
						onClick={() => onBukaFolder(node.id)}
						className="flex max-w-[22rem] cursor-pointer items-center gap-2 text-left"
					>
						<FolderIcon
							weight="fill"
							className="size-5 shrink-0 text-amber-500 dark:text-amber-400"
						/>
						<span className="truncate font-medium text-primary underline-offset-4 hover:underline">
							{node.folder.nama}
						</span>
					</button>
				);
			}

			const { Icon: FileTypeIcon, className } = getFileVisual(
				node.evidence.tipeFile,
			);

			return (
				<div className="max-w-[22rem]">
					<button
						type="button"
						onClick={() => onOpen(node.evidence)}
						className="flex w-full cursor-pointer items-center gap-2 text-left"
					>
						<FileTypeIcon
							weight="fill"
							className={cn('size-5 shrink-0', className)}
						/>
						<span className="truncate font-medium text-primary underline-offset-4 hover:underline">
							{node.evidence.namaDokumen}
						</span>
					</button>
					{/*
					 * Jalur hanya terisi di mode pencarian, tempat barisnya memang
					 * tercabut dari konteks foldernya — lihat `findPaged`.
					 */}
					{node.jalur.length > 0 && (
						<p className="mt-0.5 truncate pl-7 text-xs text-muted-foreground">
							{node.jalur.join(' / ')}
						</p>
					)}
				</div>
			);
		},
	}),
	...(showOwner
		? [
				columnHelper.accessor(
					(node) =>
						node.tipe === 'BERKAS' ? (node.evidence.studyProgramName ?? '') : '',
					{
						id: 'studyProgramName',
						header: 'Pemilik',
						enableSorting: true,
						cell: (info) =>
							info.row.original.tipe === 'FOLDER'
								? KOSONG
								: (info.row.original.evidence.studyProgramName ??
									'Universitas'),
					},
				),
			]
		: []),
	columnHelper.accessor(
		(node) => (node.tipe === 'BERKAS' ? node.evidence.tipeFile : ''),
		{
			id: 'tipeFile',
			header: 'Tipe',
			enableSorting: true,
			cell: (info) => (
				<span className="uppercase text-muted-foreground">
					{info.row.original.tipe === 'FOLDER' ? 'Folder' : info.getValue()}
				</span>
			),
		},
	),
	columnHelper.accessor(
		(node) => (node.tipe === 'BERKAS' ? node.evidence.ukuranBytes : 0),
		{
			id: 'ukuranBytes',
			header: 'Ukuran',
			enableSorting: true,
			cell: (info) =>
				info.row.original.tipe === 'FOLDER'
					? KOSONG
					: formatBytes(info.getValue()),
		},
	),
	columnHelper.display({
		id: 'status',
		header: 'Status',
		enableSorting: true,
		cell: (props) => {
			const node = props.row.original;

			if (node.tipe === 'BERKAS') {
				return <EvidenceStatusBadge status={node.evidence.status} />;
			}
			// Folder tidak punya status ekstraksi; yang berarti di sini justru kabar
			// kegagalan yang tersembunyi di dalamnya.
			return node.jumlahPerluPerhatian > 0 ? (
				<span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
					<WarningCircleIcon weight="fill" className="size-3.5" />
					{node.jumlahPerluPerhatian} perlu perhatian
				</span>
			) : (
				KOSONG
			);
		},
	}),
	columnHelper.accessor(
		(node) =>
			node.tipe === 'FOLDER'
				? node.folder.dibuatOlehNama
				: node.evidence.uploadedByName,
		{
			id: 'uploadedByName',
			header: 'Diunggah Oleh',
			enableSorting: true,
		},
	),
	columnHelper.accessor(
		(node) =>
			node.tipe === 'FOLDER'
				? node.folder.waktuDibuat
				: node.evidence.waktuDiunggah,
		{
			id: 'waktuDiunggah',
			header: 'Waktu',
			enableSorting: true,
			cell: (info) => (
				<span title={info.getValue()}>
					{formatRelativeTime(info.getValue())}
				</span>
			),
		},
	),
	columnHelper.display({
		id: 'actions',
		header: 'Aksi',
		enableHiding: false,
		cell: (props) => {
			const node = props.row.original;

			if (node.tipe === 'FOLDER') {
				if (!canManage) return KOSONG;

				return (
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Ganti nama folder"
							onClick={() => onGantiNama(node)}
							className="cursor-pointer"
						>
							<PencilSimpleIcon className="size-4" />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Pindahkan folder"
							onClick={() => onPindahkan(node)}
							className="cursor-pointer"
						>
							<ArrowsOutCardinalIcon className="size-4" />
						</Button>
						<Button
							variant="destructive"
							size="icon-sm"
							aria-label="Hapus folder"
							onClick={() => onHapusFolder(node)}
							className="cursor-pointer"
						>
							<TrashIcon className="size-4" />
						</Button>
					</div>
				);
			}

			const evidence = node.evidence;
			const showRetry = canRetry(evidence) && evidence.status === 'GAGAL';

			return (
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Lihat detail"
						onClick={() => onOpen(evidence)}
						className="cursor-pointer"
					>
						<InfoIcon className="size-4" />
					</Button>
					{canManage && (
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Pindahkan berkas"
							onClick={() => onPindahkan(node)}
							className="cursor-pointer"
						>
							<ArrowsOutCardinalIcon className="size-4" />
						</Button>
					)}
					{showRetry && (
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Coba proses lagi"
							onClick={() => onRetry(evidence)}
							className="cursor-pointer"
						>
							<ArrowClockwiseIcon className="size-4" />
						</Button>
					)}
					{canDelete(evidence) && (
						<Button
							variant="destructive"
							size="icon-sm"
							aria-label="Hapus"
							onClick={() => onDelete(evidence)}
							className="cursor-pointer"
						>
							<TrashIcon className="size-4" />
						</Button>
					)}
				</div>
			);
		},
	}),
];

function namaNode(node: EvidenceNode): string {
	return node.tipe === 'FOLDER' ? node.folder.nama : node.evidence.namaDokumen;
}
