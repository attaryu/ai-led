import { FilePlusIcon, NotePencilIcon, type Icon } from '@phosphor-icons/react';

import { formatRelativeTime } from '~/core/lib/format-time';
import {
	MAX_PROGRAM_ACTIVITY_SHOWN,
	type ProgramActivity,
	type ProgramActivityKind,
} from '../../domain/entities/program-readiness.entity';

const activityIcons: Record<ProgramActivityKind, Icon> = {
	BAB: NotePencilIcon,
	DOKUMEN: FilePlusIcon,
};

/**
 * Jejak singkat bahwa siklus yang sedang berjalan masih bergerak (§5.1b).
 *
 * Cakupannya hanya siklus ini — unggahan bukti dukung tidak ikut karena
 * berlaku lintas siklus dan jejaknya ada di panel Bukti Dukung Prodi.
 *
 * Bukan riwayat lengkap: jejak audit permanen hidup di `BAB_DRAFT` dan belum
 * dibangun.
 */
export function ProgramActivityTimeline({
	activities,
}: {
	activities: ProgramActivity[];
}) {
	return (
		<section className="flex flex-col gap-2">
			<h3 className="font-heading text-base font-medium">
				Aktivitas Siklus Ini
			</h3>
			{activities.length === 0 ? (
				<p className="rounded-lg px-4 py-3 text-sm text-muted-foreground ring-1 ring-foreground/10">
					Belum ada siklus yang berjalan, jadi belum ada aktivitas tercatat.
				</p>
			) : (
				<ul className="flex flex-col gap-3 rounded-lg px-4 py-3 ring-1 ring-foreground/10">
					{activities.slice(0, MAX_PROGRAM_ACTIVITY_SHOWN).map((activity) => {
						const ActivityIcon = activityIcons[activity.kind];
						return (
							<li
								key={`${activity.kind}-${activity.waktu}`}
								className="flex items-start gap-2.5"
							>
								<ActivityIcon
									className="mt-0.5 size-4 shrink-0 text-muted-foreground"
									weight="duotone"
								/>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{activity.judul}
									</p>
									<p className="text-xs text-muted-foreground">
										{activity.keterangan} · {formatRelativeTime(activity.waktu)}
									</p>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
