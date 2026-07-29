import * as React from 'react';
import { useNavigate } from 'react-router';
import { Plus, Trash } from '@phosphor-icons/react';
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
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';

const initialStudyPrograms: StudyProgramEntity[] = [
	{
		id: '1',
		studyProgramName: 'Teknik Informatika',
		createdAt: '2026-07-29T10:00:00.000Z',
	},
	{
		id: '2',
		studyProgramName: 'Sistem Informasi',
		createdAt: '2026-07-29T10:15:00.000Z',
	},
	{
		id: '3',
		studyProgramName: 'Teknik Elektro',
		createdAt: '2026-07-29T10:30:00.000Z',
	},
];

export function StudyProgramManagement() {
	const navigate = useNavigate();
	const [studyPrograms, setStudyPrograms] = React.useState<
		StudyProgramEntity[]
	>([]);

	// Load from localStorage or use initials
	React.useEffect(() => {
		const stored = localStorage.getItem('study_program_data');
		if (stored) {
			try {
				setStudyPrograms(JSON.parse(stored));
			} catch (e) {
				setStudyPrograms(initialStudyPrograms);
			}
		} else {
			setStudyPrograms(initialStudyPrograms);
			localStorage.setItem(
				'study_program_data',
				JSON.stringify(initialStudyPrograms),
			);
		}
	}, []);

	const saveStudyPrograms = (newPrograms: StudyProgramEntity[]) => {
		setStudyPrograms(newPrograms);
		localStorage.setItem('study_program_data', JSON.stringify(newPrograms));
	};

	const handleDelete = (id: string) => {
		if (confirm('Apakah Anda yakin ingin menghapus Prodi ini?')) {
			const updated = studyPrograms.filter((p) => p.id !== id);
			saveStudyProgramsAndUsers(updated);
		}
	};

	const saveStudyProgramsAndUsers = (updatedPrograms: StudyProgramEntity[]) => {
		saveStudyPrograms(updatedPrograms);

		// Clean up users referencing deleted prodi
		const storedUsers = localStorage.getItem('user_data');
		if (storedUsers) {
			try {
				const users = JSON.parse(storedUsers);
				const updatedUsers = users.map((u: any) => {
					if (
						u.role === 'Penyusun' &&
						!updatedPrograms.some((p) => p.id === u.studyProgramId)
					) {
						return {
							...u,
							studyProgramId: null,
							studyProgramName: '(Prodi Terhapus)',
						};
					}
					return u;
				});
				localStorage.setItem('user_data', JSON.stringify(updatedUsers));
				// Dispatch custom event to notify user table to update
				window.dispatchEvent(new Event('storage-update'));
			} catch (e) {
				console.error(e);
			}
		}
	};

	// TanStack Table setup
	const columnHelper = createColumnHelper<StudyProgramEntity>();
	const columns = React.useMemo(
		() => [
			columnHelper.accessor('id', {
				header: 'ID',
				cell: (info) => (
					<span className="font-mono text-xs">{info.getValue()}</span>
				),
			}),
			columnHelper.accessor('studyProgramName', {
				header: 'Nama Program Studi',
				cell: (info) => <span className="font-medium">{info.getValue()}</span>,
			}),
			columnHelper.accessor('createdAt', {
				header: 'Tanggal Dibuat',
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
						<Trash className="size-4" />
					</Button>
				),
			}),
		],
		[studyPrograms, columnHelper],
	);

	const table = useReactTable({
		data: studyPrograms,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Manajemen Program Studi (Prodi)
					</h2>
					<p className="text-sm text-muted-foreground">
						Kelola data Program Studi yang tersedia di sistem
					</p>
				</div>
				<Button
					onClick={() => navigate('/dashboard/study-programs/create')}
					className="gap-2"
				>
					<Plus className="size-4" />
					Tambah Prodi
				</Button>
			</div>

			<div className="bg-card rounded-lg shadow-sm border border-border">
				{studyPrograms.length === 0 ? (
					<div className="p-8 text-center text-muted-foreground">
						Belum ada data Prodi. Silakan tambah prodi baru.
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
