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

const Kosong = () => <span className="text-sm text-muted-foreground">—</span>;

/**
 * Tabel "Dokumen LED aktif" Dashboard Utama: satu baris per Dokumen LED yang
 * sedang disusun, memuat kemajuan penyusunan, tenggat, dan penilaian AMI
 * terbarunya. Skor mesin dan peninjauan Penjamin Mutu ada di kolom terpisah dan
 * tidak pernah digabung; tidak ada rata-rata institusi.
 *
 * `amiTersedia = false` (ringkasan AMI belum/gagal dimuat) mengosongkan dua
 * kolom AMI menjadi "—" tanpa mengganggu kolom lainnya.
 *
 * Rincian per bab tetap tidak dirender: bar kelengkapan menyebut pembagiannya
 * lewat tooltip, dan angka bab satu per satu adalah pertanyaan §6.1.
 */
export function ActiveDocumentsTable({
	rows,
	amiTersedia,
}: {
	rows: ActiveDocumentRow[];
	amiTersedia: boolean;
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
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Program Studi</TableHead>
					<TableHead>Status dokumen</TableHead>
					<TableHead>Progres bab</TableHead>
					<TableHead>Peninjauan skor AMI</TableHead>
					<TableHead>Rata-rata skor AMI</TableHead>
					<TableHead className="w-px">Aksi</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<ActiveDocumentTableRow
						key={row.project.id}
						row={row}
						amiTersedia={amiTersedia}
					/>
				))}
			</TableBody>
		</Table>
	);
}

function ActiveDocumentTableRow({
	row,
	amiTersedia,
}: {
	row: ActiveDocumentRow;
	amiTersedia: boolean;
}) {
	const { program, project, chapterSummary, tenggat, overview } = row;

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
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<LedProjectStatusBadge status={project.statusKeseluruhan} />
					<span className="text-xs text-muted-foreground">
						TA {project.tahunAkademik}
					</span>
				</div>
				{/*
				 * Tanggal dan sisa waktu dirender berdampingan, bukan salah satunya.
				 * "terlambat 10 hari" saja tidak bisa dipakai menjadwalkan apa pun, dan
				 * "31 Juli 2026" saja memaksa pembaca menghitung sendiri dari hari ini.
				 */}
				{tenggat && project.tenggat ? (
					<p className="mt-1.5 text-xs">
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
					<p className="mt-1.5 text-xs whitespace-nowrap text-muted-foreground">
						Tidak dipatok
					</p>
				)}
			</TableCell>

			<TableCell>
				<div className="flex min-w-24 flex-col gap-1.5">
					<ChapterProgressBar summary={chapterSummary} showLegend={false} />
					<span className="text-xs tabular-nums text-muted-foreground">
						{chapterSummary.terisi}/{chapterSummary.total} bab terisi
					</span>
				</div>
			</TableCell>

			<TableCell>
				{amiTersedia ? (
					<ReviewCell
						overview={overview}
						assessmentHref={`/led-projects/${project.id}/assessment`}
					/>
				) : (
					<Kosong />
				)}
			</TableCell>

			<TableCell>
				{amiTersedia && overview && overview.skorRataRata !== null ? (
					<>
						<p className="text-sm whitespace-nowrap tabular-nums">
							{formatSkor(overview.skorRataRata)}
							<span className="text-muted-foreground"> / {SKOR_MAKS}</span>
						</p>
						{overview.gagal > 0 && (
							<p className="mt-1 max-w-28 text-xs text-muted-foreground">
								{overview.gagal} indikator gagal dinilai
							</p>
						)}
					</>
				) : (
					<Kosong />
				)}
			</TableCell>

			<TableCell>
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
 * Kolom peninjauan: seberapa banyak indikator sesi terbaru yang sudah ditinjau
 * Penjamin Mutu. Sesi yang belum selesai tidak punya jawaban untuk itu, jadi
 * yang tampil status sesinya. Teksnya menautkan ke halaman penilaian.
 */
function ReviewCell({
	overview,
	assessmentHref,
}: {
	overview: AssessmentOverviewEntity | null;
	assessmentHref: string;
}) {
	const sesi = overview?.sesi ?? null;

	if (!overview || !sesi) {
		return (
			<span className="text-sm whitespace-nowrap text-muted-foreground">
				Belum dinilai
			</span>
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
			<Link
				to={assessmentHref}
				className={cn(
					'text-sm whitespace-nowrap tabular-nums hover:underline',
					sesi.status === 'RUNNING' && 'text-sky-700 dark:text-sky-400',
					sesi.status === 'FAILED' && 'text-destructive',
					sesi.status === 'CANCELLED' && 'text-muted-foreground',
				)}
			>
				{label}
			</Link>
		);
	}

	const persen =
		sesi.totalIndicators === 0
			? 0
			: Math.min(100, (overview.ditinjau / sesi.totalIndicators) * 100);

	return (
		<Link
			to={assessmentHref}
			className="flex min-w-24 flex-col gap-1.5 hover:underline"
		>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20">
				<div
					className="h-full rounded-full bg-emerald-500"
					style={{ width: `${persen}%` }}
				/>
			</div>
			<span className="text-xs tabular-nums text-muted-foreground">
				{overview.ditinjau} dari {sesi.totalIndicators} indikator
			</span>
			{overview.dikoreksi > 0 && (
				<span className="text-xs text-muted-foreground">
					{overview.dikoreksi} dikoreksi
				</span>
			)}
		</Link>
	);
}
