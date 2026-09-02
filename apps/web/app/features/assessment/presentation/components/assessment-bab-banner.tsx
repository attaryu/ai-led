import { SealCheckIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { formatRelativeTimeLong } from '~/core/lib/format-time';
import { useAssessmentBabSummary } from '../hooks/use-assessment-bab-summary';
import { formatSkor } from '../utils/assessment-format';

/**
 * Pita "skor final AMI untuk bab ini" di tab Review Editor Bab.
 *
 * Menjawab pertanyaan yang tidak punya jawaban lain di dalam editor: bab yang
 * sedang ditulis ini dinilai berapa. Tanpa pita ini penyusun harus meninggalkan
 * editor dan membuka halaman Penilaian AMI hanya untuk tahu apakah tulisannya
 * sudah cukup — dan yang berlaku di dokumen akreditasi memang angka itu, sudah
 * termasuk koreksi Penjamin Mutu.
 *
 * Murni baca, dan tanpa tombol jalankan: penilaian AMI menilai seluruh dokumen
 * sekaligus, jadi menjalankannya dari dalam satu bab akan menyesatkan tentang
 * apa yang sebenarnya terjadi. Tautannya ke halaman penilaian, bukan aksinya.
 */
export function AssessmentBabBanner({
	ledProjectId,
	urutanBab,
}: {
	ledProjectId: string;
	urutanBab: number;
}) {
	const ringkas = useAssessmentBabSummary(ledProjectId, urutanBab);

	if (!ringkas) return null;

	const { sesi, ringkasan } = ringkas;

	return (
		<div className="rounded-md border border-border bg-muted/60 p-2.5">
			<div className="flex items-baseline justify-between gap-2">
				<p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					<SealCheckIcon className="size-3.5" />
					Penilaian AMI
				</p>
				<p className="shrink-0 text-sm font-semibold tabular-nums">
					{ringkasan.jumlahDinilai}/{ringkasan.total}
					<span className="ml-1 text-xs font-normal text-muted-foreground">
						indikator
					</span>
				</p>
			</div>

			<p className="mt-1 text-xs leading-relaxed">
				Skor final bab ini{' '}
				<span className="font-semibold tabular-nums">
					{formatSkor(ringkasan.rataRata)}
				</span>{' '}
				rata-rata ({ringkasan.persen}% dari maksimal)
				{ringkasan.jumlahDikoreksi > 0 &&
					`, ${ringkasan.jumlahDikoreksi} sudah dikoreksi Penjamin Mutu`}
				.
			</p>

			<div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<span className="text-xs text-muted-foreground">
					Dinilai {formatRelativeTimeLong(sesi.createdAt)}
				</span>
				<Link
					to={`/led-projects/${ledProjectId}/assessment`}
					className="text-xs font-medium text-primary underline underline-offset-3"
				>
					Lihat penilaian dokumen
				</Link>
			</div>
		</div>
	);
}
