import { ClockCounterClockwiseIcon } from '@phosphor-icons/react';

import { Card, CardContent } from '~/core/components/ui/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/core/components/ui/table';
import { formatDateTime } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import {
	assessmentStatusLabels,
	type AssessmentSessionEntity,
	type AssessmentStatus,
} from '../../domain/entities/assessment-session.entity';

const statusVisual: Record<AssessmentStatus, string> = {
	COMPLETED:
		'bg-emerald-100 text-emerald-800 border-emerald-200/50 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/30',
	RUNNING:
		'bg-amber-100 text-amber-800 border-amber-200/50 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/30',
	FAILED:
		'bg-red-100 text-red-800 border-red-200/50 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/30',
	CANCELLED:
		'bg-muted text-muted-foreground border-border',
};

/**
 * Riwayat sesi penilaian.
 *
 * Sesi lama **tidak dihapus saat penilaian diulang** — itulah gunanya daftar
 * ini. Dokumen yang dinilai berkali-kali selama penyusunan menghasilkan garis
 * kemajuan, dan garis itu satu-satunya bukti bahwa perbaikan yang dikerjakan
 * memang menaikkan skor.
 */
export function AssessmentHistoryList({
	daftarSesi,
	sesiAktifId,
	onPilih,
}: {
	daftarSesi: AssessmentSessionEntity[];
	sesiAktifId: string | undefined;
	onPilih: (sesiId: string) => void;
}) {
	if (daftarSesi.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center gap-2 py-10 text-center">
					<ClockCounterClockwiseIcon className="size-7 text-muted-foreground/50" />
					<p className="text-xs leading-relaxed text-muted-foreground">
						Dokumen ini belum pernah dinilai, jadi belum ada riwayat.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent className="px-0">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Dijalankan</TableHead>
							<TableHead>Oleh</TableHead>
							<TableHead>Sumber LED</TableHead>
							<TableHead className="text-right">Indikator</TableHead>
							<TableHead>Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{daftarSesi.map((sesi) => {
							const aktif = sesi.id === sesiAktifId;

							return (
								<TableRow
									key={sesi.id}
									onClick={() => onPilih(sesi.id)}
									className={cn(
										'cursor-pointer',
										aktif && 'bg-primary/5 hover:bg-primary/10',
									)}
								>
									<TableCell className="font-medium">
										{formatDateTime(sesi.createdAt)}
										{aktif && (
											<span className="ml-2 text-xs font-normal text-primary">
												sedang dilihat
											</span>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{sesi.dijalankanOlehNama}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{sesi.sumber.sumberLed === 'EDITOR'
											? 'Editor'
											: (sesi.sumber.ledFileName ?? 'Unggahan')}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{sesi.completedIndicators}/{sesi.totalIndicators}
									</TableCell>
									<TableCell>
										<span
											className={cn(
												'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
												statusVisual[sesi.status],
											)}
										>
											{assessmentStatusLabels[sesi.status]}
										</span>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
