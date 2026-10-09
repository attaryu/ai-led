import { WarningCircleIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { type ReadinessItem } from '../../domain/entities/assessment-source.entity';

/**
 * Pengganti ringkas kartu "Sumber & Kesiapan" selama kartu itu disembunyikan.
 *
 * Sumber penilaian kini dikunci ke dokumen (LED dari editor, LKPS milik dokumen), jadi
 * tidak ada lagi yang bisa dipilih di halaman ini -- tapi tombol Jalankan tetap bisa
 * tertahan prasyarat yang kurang (LKPS belum dipilih, belum ada bab bertulisan). Tanpa
 * pemberitahuan ini tombolnya mati tanpa penjelasan. Tidak tampil sama sekali bila semua
 * prasyarat terpenuhi.
 */
export function AssessmentReadinessNotice({ items }: { items: ReadinessItem[] }) {
	const kurang = items.filter((item) => item.state === 'KURANG');
	if (kurang.length === 0) return null;

	return (
		<div
			role="status"
			className="flex flex-col gap-2 rounded-md border border-amber-200/60 bg-amber-100 p-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/30 dark:text-amber-300"
		>
			<p className="flex items-center gap-2 font-medium">
				<WarningCircleIcon className="size-4 shrink-0" weight="fill" />
				Penilaian belum bisa dijalankan
			</p>
			<ul className="flex flex-col gap-1.5">
				{kurang.map((item) => (
					<li key={item.kunci} className="flex flex-col gap-0.5">
						<span>
							<span className="font-medium">{item.label}:</span> {item.keterangan}
						</span>
						{item.tautan && (
							<Link
								to={item.tautan.to}
								className="w-fit text-xs font-medium text-primary underline underline-offset-3"
							>
								{item.tautan.label}
							</Link>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
