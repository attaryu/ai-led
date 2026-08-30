import { CheckCircleIcon, PlusIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/core/components/ui/table';
import { formatDate, formatDayCount } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import { type AccreditationUrgency } from '~/features/study-program/domain/entities/study-program.entity';
import { AccreditationRankBadge } from '~/features/study-program/presentation/components/accreditation-rank-badge';
import { type ProgramReadinessRow } from '../../domain/entities/institution-readiness.entity';

const accreditationTones: Record<AccreditationUrgency, string> = {
	AMAN: 'text-muted-foreground',
	MENDEKATI: 'text-amber-700 dark:text-amber-400',
	KEDALUWARSA: 'text-destructive',
};

/** Dibawa formulir supaya simpan dan Batal memulangkan ke dashboard ini. */
const RETURN_TO = encodeURIComponent('/dashboard');

/**
 * Tabel kedua §4.0c — prodi yang **seharusnya sudah** menyusun tapi belum.
 *
 * Isinya tiga keadaan yang sama-sama berarti "mulai sekarang": masa berlaku
 * tersisa ≤ 365 hari, masa berlaku sudah lewat, dan belum pernah terakreditasi
 * sama sekali. Ketiganya diurutkan dari yang paling telat, dan yang belum pernah
 * terakreditasi turun paling bawah karena tidak punya tanggal yang sebanding.
 *
 * Ini satu-satunya tempat di Dashboard Utama yang punya aksi ubah data, jadi
 * kolom Aksi tidak dirender sama sekali di luar Penjamin Mutu (§1) — bukan
 * dirender sebagai tombol mati.
 */
export function PendingDraftingTable({
	rows,
	canManage,
}: {
	rows: ProgramReadinessRow[];
	canManage: boolean;
}) {
	if (rows.length === 0) {
		return (
			<div className="rounded-md border border-dashed border-border p-8 text-center">
				<p className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
					<CheckCircleIcon className="size-4 shrink-0" weight="fill" />
					Tidak ada program studi yang tertinggal
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Semua program studi yang masa berlakunya menipis sudah mulai menyusun Dokumen
					LED.
				</p>
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Program Studi</TableHead>
					<TableHead>Akreditasi Terakhir</TableHead>
					<TableHead>Berlaku Sampai</TableHead>
					{canManage && <TableHead className="w-px">Aksi</TableHead>}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<PendingRow key={row.program.id} row={row} canManage={canManage} />
				))}
			</TableBody>
		</Table>
	);
}

function PendingRow({
	row,
	canManage,
}: {
	row: ProgramReadinessRow;
	canManage: boolean;
}) {
	const { program, akreditasi } = row;

	return (
		<TableRow>
			<TableCell>
				<Link
					to={`/study-programs/${program.id}`}
					className="font-medium hover:underline"
				>
					{program.studyProgramName}
				</Link>
				<p className="text-xs text-muted-foreground">
					{program.jenjang} · {program.fakultas}
				</p>
			</TableCell>

			<TableCell>
				<AccreditationRankBadge peringkat={program.peringkatAkreditasi} />
			</TableCell>

			{/*
			 * Belum pernah terakreditasi bukan masa berlaku yang sudah lewat (§5.1e):
			 * tidak ada tanggal untuk ditulis, jadi selnya menyebut keadaannya alih-alih
			 * memaksakan angka.
			 */}
			<TableCell>
				{akreditasi && program.berlakuSampaiAkreditasi ? (
					<>
						<p className="text-sm whitespace-nowrap">
							{formatDate(program.berlakuSampaiAkreditasi)}
						</p>
						<p
							className={cn(
								'mt-1 text-xs whitespace-nowrap',
								accreditationTones[akreditasi.urgensi],
							)}
						>
							{formatDayCount(akreditasi.sisaHari)}
						</p>
					</>
				) : (
					<span className="text-sm text-muted-foreground">
						Belum pernah terakreditasi
					</span>
				)}
			</TableCell>

			{canManage && (
				<TableCell>
					<Link
						to={`/dashboard/led-projects/create?studyProgramId=${program.id}&returnTo=${RETURN_TO}`}
						className={cn(
							buttonVariants({ size: 'sm' }),
							'whitespace-nowrap',
						)}
					>
						<PlusIcon className="size-4" />
						Buat Dokumen LED
					</Link>
				</TableCell>
			)}
		</TableRow>
	);
}
