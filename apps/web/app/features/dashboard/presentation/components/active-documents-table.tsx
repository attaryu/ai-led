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
import { type AssessmentOverviewEntity } from '~/features/assessment/domain/entities/assessment-overview.entity';
import { type DeadlineUrgency } from '~/features/led-project/domain/entities/led-project.entity';
import { ChapterProgressBar } from '~/features/led-project/presentation/components/chapter-progress-bar';
import { LedProjectStatusBadge } from '~/features/led-project/presentation/components/led-project-status-badge';
import { type ActiveDocumentRow } from '../../domain/entities/active-documents.entity';

const SKOR_MAKS = 4;

const formatSkor = (nilai: number) =>
	nilai.toLocaleString('id-ID', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

const deadlineTones: Record<DeadlineUrgency, string> = {
	AMAN: 'text-muted-foreground',
	DEKAT: 'text-amber-700 dark:text-amber-400',
	LEWAT: 'text-destructive',
};

const cellPad = 'px-3';

/**
 * Tabel "Dokumen LED aktif" Dashboard Utama: satu baris per Dokumen LED yang
 * sedang disusun, memuat kemajuan penyusunan, tenggat, dan penilaian AMI
 * terbarunya. Skor mesin dan peninjauan Penjamin Mutu ada di kolom terpisah dan
 * tidak pernah digabung; tidak ada rata-rata institusi.
 *
 * `amiTersedia = false` (ringkasan AMI belum/gagal dimuat) mengosongkan dua
 * kolom AMI diganti satu "—" tanpa mengganggu kolom lainnya.
 *
 * Rincian per bab tetap tidak dirender: bar kelengkapan menyebut pembagiannya
 * lewat tooltip, dan angka bab satu per satu adalah pertanyaan §6.1.
 */
export function ActiveDocumentsTable({
	rows,
	amiTersedia,
	kolomPertama = 'program-studi',
}: {
	rows: ActiveDocumentRow[];
	amiTersedia: boolean;
	/**
	 * `'judul'` dipakai Dashboard Program Studi: semua baris sudah satu prodi,
	 * jadi yang membedakan dokumen adalah judulnya, bukan nama prodi.
	 */
	kolomPertama?: 'program-studi' | 'judul';
}) {
	if (rows.length === 0) {
		return (
			<div className="rounded-md border border-dashed border-border p-8 text-center">
				<p className="text-sm font-medium">Belum ada Dokumen LED yang aktif</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Dokumen LED baru dibuat Penjamin Mutu, dan akan muncul di sini selama
					masih disusun.
				</p>
			</div>
		);
	}

	return (
		<Table className="min-w-2xl">
			<TableHeader>
				<TableRow>
					<TableHead className={cellPad}>
						{kolomPertama === 'judul' ? 'Judul dokumen' : 'Program Studi'}
					</TableHead>
					<TableHead className={cellPad}>Status dokumen</TableHead>
					<TableHead className={cellPad}>Tenggat</TableHead>
					<TableHead className={cellPad}>Progres bab</TableHead>
					<TableHead className={cellPad}>Penilaian AMI</TableHead>
					<TableHead className={cn(cellPad, 'w-px')}>Aksi</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<ActiveDocumentTableRow
						key={row.project.id}
						row={row}
						amiTersedia={amiTersedia}
						kolomPertama={kolomPertama}
					/>
				))}
			</TableBody>
		</Table>
	);
}

function ActiveDocumentTableRow({
	row,
	amiTersedia,
	kolomPertama,
}: {
	row: ActiveDocumentRow;
	amiTersedia: boolean;
	kolomPertama: 'program-studi' | 'judul';
}) {
	const { program, project, chapterSummary, tenggat, overview } = row;

	return (
		<TableRow>
			<TableCell className={cellPad}>
				{kolomPertama === 'judul' ? (
					<Link
						to={`/led-projects/${project.id}`}
						className="font-medium hover:underline"
					>
						{project.judul}
					</Link>
				) : (
					<>
						<Link
							to={`/study-programs/${program.id}`}
							className="font-medium hover:underline"
						>
							{program.studyProgramName}
						</Link>
						<p className="text-xs text-muted-foreground">
							{program.jenjang} · {program.fakultas}
						</p>
					</>
				)}
			</TableCell>

			<TableCell className={cellPad}>
				<LedProjectStatusBadge status={project.statusKeseluruhan} />
				<p className="mt-1 text-xs text-muted-foreground">
					Tahun Akademik {project.tahunAkademik}
				</p>
			</TableCell>

			<TableCell className={cellPad}>
				{/*
				 * Tanggal dan sisa waktu dirender berdampingan, bukan salah satunya.
				 * "terlambat 10 hari" saja tidak bisa dipakai menjadwalkan apa pun, dan
				 * "31 Juli 2026" saja memaksa pembaca menghitung sendiri dari hari ini.
				 */}
				{tenggat && project.tenggat ? (
					<p className="text-xs">
						<span className="whitespace-nowrap text-muted-foreground">
							{formatDate(project.tenggat)}
						</span>
						<span
							className={cn(
								'block whitespace-nowrap',
								deadlineTones[tenggat.urgensi],
							)}
						>
							{formatDayCount(tenggat.sisaHari)}
						</span>
					</p>
				) : (
					/*
					 * Tidak dipatok adalah pilihan yang sah (§14), bukan data yang hilang
					 * — karena itu kalimat, bukan "—".
					 */
					<p className="text-xs whitespace-nowrap text-muted-foreground">
						Tidak dipatok
					</p>
				)}
			</TableCell>

			<TableCell className={cellPad}>
				<div className="flex min-w-24 flex-col gap-1.5">
					<ChapterProgressBar summary={chapterSummary} showLegend={false} />
					<span className="text-xs tabular-nums text-muted-foreground">
						{chapterSummary.terisi}/{chapterSummary.total} bab terisi
					</span>
				</div>
			</TableCell>

			<AmiCell
				overview={amiTersedia ? overview : undefined}
				assessmentHref={`/led-projects/${project.id}/assessment`}
			/>

			<TableCell className={cellPad}>
				<Link
					to={`/led-projects/${project.id}`}
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

/**
 * Satu sel "Penilaian AMI". Selama sesi terbaru belum COMPLETED (atau
 * ringkasan AMI tidak dimuat) sel hanya memuat satu kalimat keadaannya.
 * `overview = undefined` berarti ringkasan AMI tidak tersedia.
 */
function AmiCell({
	overview,
	assessmentHref,
}: {
	overview: AssessmentOverviewEntity | null | undefined;
	assessmentHref: string;
}) {
	if (overview === undefined) {
		return (
			<TableCell className={cellPad}>
				<span className="text-sm text-muted-foreground">—</span>
			</TableCell>
		);
	}

	const sesi = overview?.sesi ?? null;

	if (!overview || !sesi) {
		return (
			<TableCell className={cellPad}>
				<span className="text-sm whitespace-nowrap text-muted-foreground">
					Belum dinilai
				</span>
			</TableCell>
		);
	}

	if (sesi.status !== 'COMPLETED') {
		const label =
			sesi.status === 'RUNNING'
				? `Sedang berjalan ${sesi.completedIndicators}/${sesi.totalIndicators}`
				: sesi.status === 'FAILED'
					? 'Gagal'
					: 'Dibatalkan';
		return (
			<TableCell className={cellPad}>
				<Link
					to={assessmentHref}
					className={cn(
						'text-sm whitespace-nowrap tabular-nums hover:underline',
						sesi.status === 'RUNNING'
							? 'text-sky-700 dark:text-sky-400'
							: sesi.status === 'FAILED'
								? 'text-destructive'
								: 'text-muted-foreground',
					)}
				>
					{label}
				</Link>
			</TableCell>
		);
	}

	const persen =
		sesi.totalIndicators === 0
			? 0
			: Math.min(100, (overview.ditinjau / sesi.totalIndicators) * 100);

	return (
		<TableCell className={cellPad}>
			<Link
				to={assessmentHref}
				className="flex min-w-24 flex-col gap-2 hover:underline"
			>
				<span className="text-xs whitespace-nowrap tabular-nums text-muted-foreground">
					Skor rata-rata:{' '}
					{overview.skorRataRata !== null ? (
						<span className="font-semibold text-foreground">
							{formatSkor(overview.skorRataRata)} / {SKOR_MAKS}
						</span>
					) : (
						'—'
					)}
				</span>

				<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20">
					<div
						className="h-full rounded-full bg-emerald-500"
						style={{ width: `${persen}%` }}
					/>
				</div>
				<span className="text-xs tabular-nums whitespace-nowrap text-muted-foreground">
					{overview.ditinjau} dari {sesi.totalIndicators} indikator
				</span>
			</Link>
		</TableCell>
	);
}
