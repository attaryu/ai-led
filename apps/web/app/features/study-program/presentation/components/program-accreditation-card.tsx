import {
	CertificateIcon,
	SealCheckIcon,
	UserCircleIcon,
} from '@phosphor-icons/react';

import { Card, CardContent } from '~/core/components/ui/card';
import { formatDate, formatDayCount } from '~/core/lib/format-time';
import { cn } from '~/core/lib/utils';
import {
	deriveAccreditationValidity,
	type AccreditationUrgency,
	type StudyProgramEntity,
} from '../../domain/entities/study-program.entity';
import { AccreditationRankBadge } from './accreditation-rank-badge';

const validityStyles: Record<AccreditationUrgency, string> = {
	AMAN: 'text-muted-foreground',
	MENDEKATI: 'text-amber-700 dark:text-amber-400',
	KEDALUWARSA: 'text-destructive',
};

/**
 * Identitas prodi beserta akreditasi yang sedang berlaku
 * (docs/application_flow.md §5.1a).
 *
 * Blok ini berbicara tentang **masa lalu**: peringkat dan masa berlakunya
 * adalah hasil penyusunan sebelumnya yang sudah disahkan, bukan ukuran
 * pekerjaan yang sedang berjalan. Karena itu masa berlaku dirender di sini,
 * bukan sebagai salah satu kartu di baris ringkasan penyusunan — sebaris dengan
 * kelengkapan bab, angka ini terbaca seolah ikut mengukur usaha sekarang.
 */
export function ProgramAccreditationCard({
	program,
}: {
	program: StudyProgramEntity;
}) {
	const validity = deriveAccreditationValidity(
		program.berlakuSampaiAkreditasi,
	);

	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Akreditasi Berjalan
						</p>
						<div className="mt-1 flex items-center gap-2">
							<span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-semibold">
								{program.jenjang}
							</span>
							<h3 className="truncate font-heading text-lg font-bold tracking-tight">
								{program.studyProgramName}
							</h3>
						</div>
						<p className="mt-1 text-sm text-muted-foreground">
							{program.fakultas} · Kode {program.kode}
						</p>
						<p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
							<UserCircleIcon className="size-4 shrink-0" weight="duotone" />
							{program.ketuaProdi}
						</p>
					</div>

					<AccreditationRankBadge peringkat={program.peringkatAkreditasi} />
				</div>

				{/*
				 * Prodi yang belum pernah terakreditasi tidak punya SK maupun masa
				 * berlaku. Itu keadaan yang berbeda dari masa berlaku yang habis, jadi
				 * dikatakan apa adanya alih-alih dirender sebagai baris kosong.
				 */}
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-sm">
					{validity === null ? (
						<p className="text-muted-foreground">
							Belum pernah terakreditasi — hasil penyusunan pertama akan mengisi
							bagian ini.
						</p>
					) : (
						<>
							{program.nomorSkAkreditasi && (
								<span className="flex items-center gap-1.5 text-muted-foreground">
									<CertificateIcon className="size-4 shrink-0" weight="duotone" />
									SK {program.nomorSkAkreditasi}
								</span>
							)}
							<span
								className={cn(
									'flex items-center gap-1.5',
									validityStyles[validity.urgensi],
								)}
							>
								<SealCheckIcon className="size-4 shrink-0" weight="duotone" />
								Berlaku s/d {formatDate(program.berlakuSampaiAkreditasi!)} ·{' '}
								{formatDayCount(validity.sisaHari)}
							</span>
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
