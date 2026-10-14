import { GaugeIcon, ListChecksIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

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
 * Dua kartu penilaian AMI Dashboard Dokumen: skor rata-rata dan indikator yang
 * sudah ditinjau. Tiap kartu menautkan ke halaman Penilaian AMI.
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

	// Selain COMPLETED, nilainya teks keadaan sesi, bukan angka.
	const ditinjau =
		selesai && sesi
			? `${selesai.ditinjau}/${sesi.totalIndicators}`
			: !sesi
				? 'Belum dinilai'
				: sesi.status === 'RUNNING'
					? `Berjalan ${sesi.completedIndicators}/${sesi.totalIndicators}`
					: sesi.status === 'FAILED'
						? 'Gagal'
						: 'Dibatalkan';

	return (
		<>
			<Link to={href} className={tautan}>
				<StatCard
					boxed
					icon={GaugeIcon}
					label="Skor AMI rata-rata"
					value={skor}
					className={kartu}
				/>
			</Link>
			<Link to={href} className={tautan}>
				<StatCard
					boxed
					icon={ListChecksIcon}
					label="Indikator ditinjau"
					value={ditinjau}
					valueClassName={
						selesai ? 'truncate' : 'truncate text-muted-foreground'
					}
					className={kartu}
				/>
			</Link>
		</>
	);
}
