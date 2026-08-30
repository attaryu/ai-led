import * as React from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { TrashIcon, PencilSimpleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { type UserEntity } from '../../domain/entities/user.entity';

const columnHelper = createColumnHelper<UserEntity>();

export const getUserColumns = (): ColumnDef<UserEntity, any>[] => [
	columnHelper.accessor('namaLengkap', {
		header: 'Nama Lengkap',
		cell: (info) => <span className="font-medium">{info.getValue()}</span>,
		enableSorting: true,
	}),
	columnHelper.accessor('email', {
		header: 'Email',
		cell: (info) => (
			<span className="text-muted-foreground">{info.getValue()}</span>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('role', {
		header: 'Role',
		/*
		 * Satu rupa untuk keempat role, bukan empat warna pastel.
		 *
		 * Warna sebaiknya disimpan untuk hal yang menuntut tindakan — itulah
		 * yang dikerjakan badge status di `set-status-badge.tsx` dan kawan-kawan,
		 * dan mereka sengaja dibiarkan berwarna. Role bukan keadaan: ia tidak
		 * pernah genting, tidak pernah membaik, dan tidak ada satu pun di
		 * antaranya yang lebih perlu diperhatikan dari yang lain. Memberinya
		 * empat warna berarti menghabiskan satu-satunya isyarat terkuat di
		 * halaman untuk membedakan hal yang sudah dibedakan oleh tulisannya
		 * sendiri — dan membuat badge status di tabel lain ikut kehilangan daya.
		 */
		cell: (info) => (
			<span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground/80">
				{info.getValue() as string}
			</span>
		),
		enableSorting: true,
	}),
	columnHelper.accessor('studyProgramName', {
		header: 'Program Studi',
		cell: (info) =>
			info.getValue() || (
				<span className="text-muted-foreground font-mono text-xs">-</span>
			),
		enableSorting: true,
	}),
	columnHelper.accessor('createdAt', {
		header: 'Tanggal Terdaftar',
		cell: (info) =>
			new Date(info.getValue()).toLocaleDateString('id-ID', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			}),
		enableSorting: true,
	}),
	columnHelper.display({
		id: 'actions',
		header: 'Aksi',
		enableHiding: false,
		cell: (props) => {
			const id = props.row.original.id;
			const onDelete = props.table.options.meta?.onDelete;
			const onEdit = props.table.options.meta?.onEdit;
			/*
			 * `ghost`, bukan kotak berbingkai di tiap baris.
			 *
			 * Dua bingkai per baris berarti garis tepi tabel terbanyak justru
			 * berada di kolom yang isinya paling tidak informatif. Ikonnya sendiri
			 * sudah cukup terbaca sebagai tombol begitu disorot.
			 *
			 * Keduanya tetap terlihat permanen, tidak disembunyikan sampai
			 * baris disorot: hover bukan isyarat yang tersedia di sentuh, dan
			 * tombol yang hanya muncul saat disorot tidak bisa ditemukan tanpa
			 * lebih dulu menebak bahwa ia ada.
			 */
			return (
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => onEdit?.(id)}
						aria-label="Ubah user"
						className="cursor-pointer text-muted-foreground hover:text-foreground"
					>
						<PencilSimpleIcon className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => onDelete?.(id)}
						aria-label="Hapus user"
						className="cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					>
						<TrashIcon className="size-4" />
					</Button>
				</div>
			);
		},
	}),
];
