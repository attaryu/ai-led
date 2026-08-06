import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/core/components/ui/table';
import { formatDayCount } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import { type DeadlineUrgency } from '~/features/led-project/domain/entities/led-project.entity';
import { LedProjectStatusBadge } from '~/features/led-project/presentation/components/led-project-status-badge';
import { type AccreditationUrgency } from '~/features/study-program/domain/entities/study-program.entity';
import { AccreditationRankBadge } from '~/features/study-program/presentation/components/accreditation-rank-badge';
import { type ProgramReadinessRow } from '../../domain/entities/institution-readiness.entity';

const accreditationTones: Record<AccreditationUrgency, string> = {
	AMAN: 'text-muted-foreground',
	MENDEKATI: 'text-amber-700 dark:text-amber-400',
	KEDALUWARSA: 'text-destructive',
};

const deadlineTones: Record<DeadlineUrgency, string> = {
	AMAN: 'text-muted-foreground',
	DEKAT: 'text-amber-700 dark:text-amber-400',
	LEWAT: 'text-destructive',
};

/** Sel kosong yang seragam; artinya "tidak berlaku di baris ini". */
function Kosong() {
	return <span className="text-muted-foreground">—</span>;
}

/**
 * Blok C Dashboard Utama (docs/application_flow.md §4.0c) — inti halaman.
 *
 * Satu baris per prodi, **diurutkan dari yang paling perlu ditindak**, bukan
 * alfabet: halaman ini dibaca dari atas, dan satu-satunya pertanyaan yang ia ada
 * untuk menjawabnya adalah "prodi mana yang tertinggal".
 *
 * Sengaja **tanpa pencarian, pengurutan, dan paginasi**, dengan alasan yang sama
 * seperti tabel bab di §6.1: jumlah prodi tetap dan urutan risikonya adalah cara
 * tabel ini dibaca, jadi mengacaknya justru merusaknya. Ini memang berbeda dari
 * §4.6/§5.3 yang daftarnya memang untuk dijelajahi.
 *
 * Angka tiap barisnya datang dari fungsi domain yang sama dengan Dashboard
 * Prodi, sehingga baris di sini dan halaman `/study-programs/:id` tidak pernah
 * bisa menyebut angka yang berbeda.
 */
export function ProgramReadinessTable({
	rows,
}: {
	rows: ProgramReadinessRow[];
}) {
	if (rows.length === 0) {
		return (
			<section className="flex flex-col gap-3">
				<TableHeading />
				<div className="rounded-md border border-dashed border-border p-8 text-center">
					<p className="text-sm font-medium">Belum ada program studi</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Kesiapan akreditasi baru bisa dipantau setelah ada prodi yang
						terdaftar.
					</p>
				</div>
			</section>
		);
	}

	return (
		<section className="flex flex-col gap-3">
			<TableHeading />
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Program Studi</TableHead>
						<TableHead>Akreditasi</TableHead>
						<TableHead>Siklus Berjalan</TableHead>
						<TableHead>Kelengkapan Bab</TableHead>
						<TableHead>Kesiapan Review</TableHead>
						<TableHead>Sisa Tenggat</TableHead>
						<TableHead>Perlu Perhatian</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<ProgramRow key={row.program.id} row={row} />
					))}
				</TableBody>
			</Table>
		</section>
	);
}

function TableHeading() {
	return (
		<div>
			<h3 className="font-heading text-lg font-bold tracking-tight">
				Kesiapan per Prodi
			</h3>
			<p className="text-sm text-muted-foreground">
				Diurutkan dari yang paling perlu ditindak. Klik nama prodi untuk masuk ke
				Dashboard Prodi-nya.
			</p>
		</div>
	);
}

function ProgramRow({ row }: { row: ProgramReadinessRow }) {
	const { program, akreditasi, siklusAktif, chapterSummary, tenggat } = row;

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
				{/*
				 * Masa berlaku yang kosong berarti "tidak ada", bukan "sudah lewat"
				 * (§5.1e) — prodi yang belum pernah terakreditasi mengatakannya dengan
				 * kalimat, bukan dengan angka nol.
				 */}
				<p
					className={cn(
						'mt-1 text-xs',
						akreditasi
							? accreditationTones[akreditasi.urgensi]
							: 'text-muted-foreground',
					)}
				>
					{akreditasi
						? formatDayCount(akreditasi.sisaHari)
						: 'Belum pernah terakreditasi'}
				</p>
			</TableCell>

			<TableCell>
				{siklusAktif ? (
					<>
						<LedProjectStatusBadge status={siklusAktif.statusKeseluruhan} />
						<p className="mt-1 text-xs text-muted-foreground">
							TA {siklusAktif.tahunAkademik}
						</p>
					</>
				) : (
					<span className="text-sm text-muted-foreground">Belum ada</span>
				)}
			</TableCell>

			<TableCell>
				{siklusAktif ? (
					<div className="flex min-w-24 flex-col gap-1.5">
						<span className="text-sm tabular-nums">
							{chapterSummary.terisi}/{chapterSummary.total}
						</span>
						<div
							className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
							role="progressbar"
							aria-valuenow={chapterSummary.persenKelengkapan}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-label={`Kelengkapan bab ${program.studyProgramName}`}
						>
							<div
								className="h-full rounded-full bg-primary transition-[width]"
								style={{ width: `${chapterSummary.persenKelengkapan}%` }}
							/>
						</div>
					</div>
				) : (
					<Kosong />
				)}
			</TableCell>

			<TableCell className="tabular-nums">
				{siklusAktif ? (
					`${chapterSummary.terkunci}/${chapterSummary.total}`
				) : (
					<Kosong />
				)}
			</TableCell>

			<TableCell>
				{!siklusAktif ? (
					<Kosong />
				) : tenggat ? (
					<span
						className={cn(
							'text-sm whitespace-nowrap',
							deadlineTones[tenggat.urgensi],
						)}
					>
						{formatDayCount(tenggat.sisaHari)}
					</span>
				) : (
					<span className="text-sm whitespace-nowrap text-muted-foreground">
						Tidak dipatok
					</span>
				)}
			</TableCell>

			<TableCell>
				<ProgramAttentionCell row={row} />
			</TableCell>
		</TableRow>
	);
}

/**
 * Ringkasan panel Perlu Perhatian Dashboard Prodi (§5.1c) yang dipadatkan jadi
 * satu sel: jumlahnya, diwarnai menurut severitas tertinggi. Rinciannya memang
 * tempatnya di prodi masing-masing, bukan di tabel perbandingan.
 */
function ProgramAttentionCell({ row }: { row: ProgramReadinessRow }) {
	if (row.attention.length === 0) {
		return (
			<span className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
				<CheckCircleIcon className="size-4 shrink-0" weight="fill" />
				Tidak ada
			</span>
		);
	}

	/*
	 * Jumlah yang mendesak turun ke barisnya sendiri, bukan jadi keterangan dalam
	 * kurung di baris yang sama: kolom ini sempit, dan tanda kurung yang terpotong
	 * di tengah kata jauh lebih sulit dibaca daripada dua baris pendek. Bentuknya
	 * jadi sama dengan sel lain di tabel ini — nilai utama, lalu keterangan kecil.
	 */
	return (
		<>
			<span
				className={cn(
					'flex items-center gap-1.5 text-sm whitespace-nowrap',
					row.mendesak > 0
						? 'text-destructive'
						: 'text-amber-700 dark:text-amber-400',
				)}
			>
				<WarningCircleIcon className="size-4 shrink-0" weight="fill" />
				{row.attention.length} hal
			</span>
			{row.mendesak > 0 && (
				<p className="mt-1 text-xs font-medium text-destructive">
					{row.mendesak} mendesak
				</p>
			)}
		</>
	);
}
