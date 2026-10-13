import { UserCircleIcon } from '@phosphor-icons/react';

import { Card, CardContent } from '~/core/components/ui/card';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';

/**
 * Identitas prodi di puncak Dashboard Program Studi
 * (docs/application_flow.md §5.1a).
 *
 * Dulu kartu ini juga memuat peringkat akreditasi, nomor SK, dan masa
 * berlakunya ("Akreditasi Aktif"). Semuanya dibuang dari UI karena peringkat
 * tidak dipakai pembangkitan AI maupun penilaian AMI; datanya tetap ada di DB.
 */
export function ProgramIdentityCard({
	program,
}: {
	program: StudyProgramEntity;
}) {
	return (
		<Card size="sm">
			<CardContent>
				<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Program Studi
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
			</CardContent>
		</Card>
	);
}
