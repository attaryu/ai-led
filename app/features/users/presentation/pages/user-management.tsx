import * as React from 'react';
import { useNavigate } from 'react-router';
import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import {
	useReactTable,
	getCoreRowModel,
	flexRender,
	createColumnHelper,
} from '@tanstack/react-table';

import { Button } from '~/core/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/core/components/ui/table';
import { type UserEntity } from '../../domain/entities/user.entity';

const initialUsers: UserEntity[] = [
	{
		id: '1',
		namaLengkap: 'Ahmad Fauzi',
		email: 'ahmad.fauzi@univ.ac.id',
		role: 'Penjamin Mutu',
		studyProgramId: null,
		studyProgramName: null,
		createdAt: '2026-07-29T10:00:00.000Z',
	},
	{
		id: '2',
		namaLengkap: 'Siti Rahmawati',
		email: 'siti.rahma@univ.ac.id',
		role: 'Penyusun',
		studyProgramId: '1',
		studyProgramName: 'Teknik Informatika',
		createdAt: '2026-07-29T10:10:00.000Z',
	},
	{
		id: '3',
		namaLengkap: 'Prof. Dr. Ir. H. Bambang',
		email: 'bambang.rektor@univ.ac.id',
		role: 'Pimpinan',
		studyProgramId: null,
		studyProgramName: null,
		createdAt: '2026-07-29T10:20:00.000Z',
	},
];

export function UserManagement() {
	const navigate = useNavigate();
	const [users, setUsers] = React.useState<UserEntity[]>([]);

	// Fetch users from localStorage or default
	const loadData = React.useCallback(() => {
		const storedUsers = localStorage.getItem('user_data');
		if (storedUsers) {
			try {
				setUsers(JSON.parse(storedUsers));
			} catch (e) {
				setUsers(initialUsers);
			}
		} else {
			setUsers(initialUsers);
			localStorage.setItem('user_data', JSON.stringify(initialUsers));
		}
	}, []);

	React.useEffect(() => {
		loadData();
		window.addEventListener('storage-update', loadData);
		return () => {
			window.removeEventListener('storage-update', loadData);
		};
	}, [loadData]);

	const saveUsers = (newUsers: UserEntity[]) => {
		setUsers(newUsers);
		localStorage.setItem('user_data', JSON.stringify(newUsers));
	};

	const handleDelete = (id: string) => {
		if (confirm('Apakah Anda yakin ingin menghapus User ini?')) {
			const updated = users.filter((u) => u.id !== id);
			saveUsers(updated);
		}
	};

	// TanStack Table configuration
	const columnHelper = createColumnHelper<UserEntity>();
	const columns = React.useMemo(
		() => [
			columnHelper.accessor('namaLengkap', {
				header: 'Nama Lengkap',
				cell: (info) => <span className="font-medium">{info.getValue()}</span>,
			}),
			columnHelper.accessor('email', {
				header: 'Email',
				cell: (info) => (
					<span className="text-muted-foreground">{info.getValue()}</span>
				),
			}),
			columnHelper.accessor('role', {
				header: 'Role',
				cell: (info) => {
					const val = info.getValue();
					const colors = {
						'Penjamin Mutu': 'bg-primary/10 text-primary border-primary/20',
						Penyusun:
							'bg-secondary/20 text-secondary-foreground border-secondary',
						Pimpinan:
							'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/50 dark:border-amber-800/30',
					};
					return (
						<span
							className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colors[val] || ''}`}
						>
							{val}
						</span>
					);
				},
			}),
			columnHelper.accessor('studyProgramName', {
				header: 'Program Studi',
				cell: (info) =>
					info.getValue() || (
						<span className="text-muted-foreground font-mono text-xs">-</span>
					),
			}),
			columnHelper.accessor('createdAt', {
				header: 'Tanggal Terdaftar',
				cell: (info) =>
					new Date(info.getValue()).toLocaleDateString('id-ID', {
						year: 'numeric',
						month: 'long',
						day: 'numeric',
					}),
			}),
			columnHelper.display({
				id: 'actions',
				header: 'Aksi',
				cell: (props) => (
					<Button
						variant="destructive"
						size="icon-sm"
						onClick={() => handleDelete(props.row.original.id)}
					>
						<TrashIcon className="size-4" />
					</Button>
				),
			}),
		],
		[users, columnHelper],
	);

	const table = useReactTable({
		data: users,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Manajemen Pengguna (User)
					</h2>
					<p className="text-sm text-muted-foreground">
						Kelola akses, data diri, dan peran pengguna di dalam sistem
					</p>
				</div>
				<Button
					onClick={() => navigate('/dashboard/users/create')}
					className="gap-2"
				>
					<PlusIcon className="size-4" />
					Tambah User
				</Button>
			</div>

			<div className="bg-card rounded-lg shadow-sm border border-border">
				{users.length === 0 ? (
					<div className="p-8 text-center text-muted-foreground">
						Belum ada data user. Silakan tambah user baru.
					</div>
				) : (
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
							{table.getRowModel().rows.map((row) => (
								<TableRow key={row.id}>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</div>
		</div>
	);
}
