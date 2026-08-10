import { ArrowRightIcon } from '@phosphor-icons/react';
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
import { type DeadlineUrgency } from '~/features/led-project/domain/entities/led-project.entity';
import { ChapterProgressBar } from '~/features/led-project/presentation/components/chapter-progress-bar';
import { LedProjectStatusBadge } from '~/features/led-project/presentation/components/led-project-status-badge';
import { type ProgramReadinessRow } from '../../domain/entities/institution-readiness.entity';

const deadlineTones: Record<DeadlineUrgency, string> = {
	AMAN: 'text-muted-foreground',
	DEKAT: 'text-amber-700 dark:text-amber-400',
	LEWAT: 'text-destructive',
};

/**
 * Tabel pertama §4.0c — prodi yang **sedang** menyusun Dokumen LED.
 *
 * Kolomnya menjawab satu pertanyaan: seberapa jauh penyusunan itu berjalan dan
 * apakah ia akan sampai tepat waktu. Prodi yang belum menyusun tidak punya
 * jawaban untuk salah satu pun kolom di sini — itulah alasan mereka punya
 * tabelnya sendiri alih-alih mengisi setengah baris dengan `—`.
 *
 * Rincian per bab tetap tidak dirender: bar kelengkapan menyebut pembagiannya
 * lewat tooltip, dan angka bab satu per satu adalah pertanyaan §6.1.
 */
export function ActiveDraftingTable({ rows }: { rows: ProgramReadinessRow[] }) {
	if (rows.length === 0) {
		return (
			<div className="rounded-md border border-dashed border-border p-8 text-center">
				<p className="text-sm font-medium">
					Belum ada prodi yang sedang menyusun
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Dokumen LED baru dibuat Penjamin Mutu, dan akan muncul di sini begitu
					penyusunannya dimulai.
				</p>
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Program Studi</TableHead>
					<TableHead>Penyusunan</TableHead>
					<TableHead>Progres Bab</TableHead>
					<TableHead>Tenggat</TableHead>
					<TableHead className="w-px">Aksi</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<ActiveRow key={row.program.id} row={row} />
				))}
			</TableBody>
		</Table>
	);
}

function ActiveRow({ row }: { row: ProgramReadinessRow }) {
	const { program, penyusunanAktif, chapterSummary, tenggat } = row;

	// Baris ini hanya dibangun untuk prodi yang sedang menyusun; penjaga ini ada
	// supaya tipenya menyempit, bukan karena keadaannya mungkin terjadi.
	if (!penyusunanAktif) return null;

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
				<LedProjectStatusBadge status={penyusunanAktif.statusKeseluruhan} />
				<p className="mt-1 text-xs text-muted-foreground">
					TA {penyusunanAktif.tahunAkademik}
				</p>
			</TableCell>

			<TableCell>
				<div className="flex min-w-32 flex-col gap-1.5">
					<ChapterProgressBar summary={chapterSummary} showLegend={false} />
					<span className="text-xs tabular-nums text-muted-foreground">
						{chapterSummary.terisi}/{chapterSummary.total} bab terisi
					</span>
				</div>
			</TableCell>

			{/*
			 * Tanggal dan sisa waktu dirender berdampingan, bukan salah satunya.
			 * "terlambat 10 hari" saja tidak bisa dipakai menjadwalkan apa pun, dan
			 * "31 Juli 2026" saja memaksa pembaca menghitung sendiri dari hari ini.
			 */}
			<TableCell>
				{tenggat && penyusunanAktif.tenggat ? (
					<>
						<p className="text-sm whitespace-nowrap">
							{formatDate(penyusunanAktif.tenggat)}
						</p>
						<p
							className={cn(
								'mt-1 text-xs whitespace-nowrap',
								deadlineTones[tenggat.urgensi],
							)}
						>
							{formatDayCount(tenggat.sisaHari)}
						</p>
					</>
				) : (
					/*
					 * Tidak dipatok adalah pilihan yang sah (§14), bukan data yang hilang
					 * — karena itu kalimat, bukan "—".
					 */
					<span className="text-sm whitespace-nowrap text-muted-foreground">
						Tidak dipatok
					</span>
				)}
			</TableCell>

			<TableCell>
				<Link
					to={`/led-projects/${penyusunanAktif.id}`}
					className={cn(
						buttonVariants({ variant: 'outline', size: 'sm' }),
						'whitespace-nowrap',
					)}
				>
					Buka
					<ArrowRightIcon className="size-4" />
				</Link>
			</TableCell>
		</TableRow>
	);
}
