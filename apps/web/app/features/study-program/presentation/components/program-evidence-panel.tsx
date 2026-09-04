import { ArrowRightIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { buttonVariants } from '~/core/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { formatRelativeTime } from '~/core/lib/format-time';
import { type EvidenceSummary } from '~/features/evidence/domain/entities/evidence.entity';

/**
 * Kesehatan Perpustakaan Bukti Dukung prodi (docs/application_flow.md §5.1c).
 *
 * Angkanya sengaja **hanya berkas milik prodi** (`owner_tipe = PROGRAM_STUDI`),
 * sama persis dengan yang terlihat di halaman yang dituju tombolnya. Versi
 * sebelumnya ikut menghitung berkas level tenant, sehingga dashboard menyebut
 * belasan berkas sementara perpustakaannya hanya berisi beberapa.
 *
 * Ini sumber daya **lintas penyusunan**: bukti dukung tidak terikat ke satu
 * Dokumen LED (§5.2), jadi tempatnya di luar baris ringkasan penyusunan.
 */
export function ProgramEvidencePanel({
	summary,
	programId,
}: {
	summary: EvidenceSummary;
	programId: string;
}) {
	const belumSiap = summary.menunggu + summary.diproses;

	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Bukti Dukung</CardTitle>
				<CardDescription>
					{summary.total === 0
						? 'Belum ada berkas milik program studi ini.'
						: `${summary.siap} dari ${summary.total} berkas siap dipakai AI (${summary.persenSiap}%).`}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{summary.total > 0 && (
					<div
						className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
						role="progressbar"
						aria-valuenow={summary.persenSiap}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label="Bukti dukung program studi yang siap"
					>
						<div
							className="h-full rounded-full bg-primary transition-[width]"
							style={{ width: `${summary.persenSiap}%` }}
						/>
					</div>
				)}

				{belumSiap > 0 && (
					<p className="text-xs text-muted-foreground">
						{belumSiap} berkas masih dalam antrean ekstraksi.
					</p>
				)}

				{summary.gagal > 0 && (
					<p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
						<WarningCircleIcon className="mt-0.5 size-3.5 shrink-0" weight="fill" />
						{summary.gagal} berkas gagal diproses dan bisa dicoba ulang.
					</p>
				)}

				{summary.terakhirDiunggah && summary.berkasTerakhir && (
					<p className="truncate text-xs text-muted-foreground">
						Terakhir: {summary.berkasTerakhir} ·{' '}
						{formatRelativeTime(summary.terakhirDiunggah)}
					</p>
				)}

				<div>
					<Link
						to={`/study-programs/${programId}/evidence`}
						className={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						Buka perpustakaan
						<ArrowRightIcon className="size-4" />
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
