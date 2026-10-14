import { Link } from 'react-router';

import { Card, CardContent, CardHeader, CardTitle } from '~/core/components/ui/card';
import { StatCard } from '~/core/components/ui/stat-card';
import {
	formatSkor,
	SKOR_MAKS,
} from '~/features/assessment/presentation/components/assessment-overview-summary';
import { type DocumentAmiOverview } from '~/features/assessment/presentation/hooks/use-document-ami-overview';

const tautan =
	'group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring';
const kartu = 'h-full transition-colors group-hover:bg-muted/40';

/**
 * Dua kartu penilaian AMI Dashboard Dokumen: skor rata-rata dan progres
 * peninjauan. Tiap kartu menautkan ke halaman Penilaian AMI.
 *
 * Tidak merender apa pun sampai ringkasannya siap (lihat
 * `useDocumentAmiOverview`). Belum ada sesi tetap menampilkan keduanya,
 * karena "belum dinilai" adalah jawaban yang sah.
 */
export function ProjectAmiCards({
	projectId,
	ami,
}: {
	projectId: string;
	ami: DocumentAmiOverview;
}) {
	if (ami.status !== 'siap') return null;

	const href = `/led-projects/${projectId}/assessment`;
	const sesi = ami.overview?.sesi ?? null;
	const selesai = ami.overview && sesi?.status === 'COMPLETED' ? ami.overview : null;

	const skor =
		selesai && selesai.skorRataRata !== null
			? `${formatSkor(selesai.skorRataRata)} / ${SKOR_MAKS}`
			: '—';

	const persen =
		selesai && sesi && sesi.totalIndicators > 0
			? Math.min(100, (selesai.ditinjau / sesi.totalIndicators) * 100)
			: 0;

	const keterangan = !sesi
		? 'Belum dinilai'
		: sesi.status === 'RUNNING'
			? `Sedang berjalan ${sesi.completedIndicators}/${sesi.totalIndicators}`
			: sesi.status === 'FAILED'
				? 'Gagal'
				: 'Dibatalkan';

	return (
		<>
			<Link to={href} className={tautan}>
				<StatCard label="Skor AMI rata-rata" value={skor} className={kartu} />
			</Link>
			<Link to={href} className={tautan}>
				<Card size="sm" className={`${kartu} gap-3`}>
					<CardHeader>
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Progres penilaian AMI
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{selesai && (
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20">
								<div
									className="h-full rounded-full bg-emerald-500"
									style={{ width: `${persen}%` }}
								/>
							</div>
						)}
						<p className="text-xs tabular-nums text-muted-foreground">
							{selesai && sesi
								? `${selesai.ditinjau} dari ${sesi.totalIndicators} indikator`
								: keterangan}
						</p>
					</CardContent>
				</Card>
			</Link>
		</>
	);
}
