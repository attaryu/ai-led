import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { type ChapterAttention } from '~/features/chapter/domain/entities/chapter.entity';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';
import { LedProjectStatusBadge } from './led-project-status-badge';

/** Berapa banyak bab yang ditampilkan sebelum sisanya diringkas jadi satu baris. */
const MAX_ATTENTION_SHOWN = 5;

/**
 * Panel samping Dashboard Project LED: apa langkah berikutnya, dan di mana
 * dokumen ini berdiri sekarang.
 *
 * Daftarnya dipotong supaya panel tetap terbaca sebagai "yang paling mendesak" —
 * gambaran lengkapnya sudah ada di tabel di sebelahnya.
 */
export function ProjectAttentionPanel({
	project,
	attention,
}: {
	project: LedProjectEntity;
	attention: ChapterAttention[];
}) {
	const shown = attention.slice(0, MAX_ATTENTION_SHOWN);
	const sisa = attention.length - shown.length;

	return (
		<div className="flex flex-col gap-4">
			<Card size="sm">
				<CardHeader>
					<CardTitle>Perlu Perhatian</CardTitle>
					<CardDescription>
						{attention.length === 0
							? 'Tidak ada bab yang tertinggal.'
							: `${attention.length} bab menunggu ditindaklanjuti.`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{attention.length === 0 ? (
						<p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
							<CheckCircleIcon className="size-4 shrink-0" weight="fill" />
							Seluruh bab sudah terisi dan tidak ada catatan tertunda.
						</p>
					) : (
						<ul className="flex flex-col gap-3">
							{shown.map(({ chapter, alasan }) => (
								<li key={chapter.id} className="flex items-start gap-2">
									<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">
											{chapter.urutanBab}. {chapter.judulBab}
										</p>
										<p className="text-xs text-muted-foreground">{alasan}</p>
									</div>
								</li>
							))}
							{sisa > 0 && (
								<li className="text-xs text-muted-foreground">
									…dan {sisa} bab lain, lihat tabel di samping.
								</li>
							)}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card size="sm">
				<CardHeader>
					<CardTitle>Status Dokumen</CardTitle>
					<CardDescription>
						Tahun Akademik {project.tahunAkademik}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col items-start gap-4">
					<LedProjectStatusBadge status={project.statusKeseluruhan} />
					{/*
					 * Status hanya bisa diubah Penjamin Mutu lewat form Edit Dokumen LED
					 * (§14), jadi di sini murni tampilan — tidak ada aksi yang perlu
					 * disembunyikan per role.
					 */}
					<Link
						to={`/study-programs/${project.studyProgramId}/evidence`}
						className={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						Bukti Dukung program studi ini
					</Link>
				</CardContent>
			</Card>
		</div>
	);
}
