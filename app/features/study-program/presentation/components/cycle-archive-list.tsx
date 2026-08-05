import { CaretRightIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

import { type LedProjectEntity } from '~/features/led-project/domain/entities/led-project.entity';
import { LedProjectStatusBadge } from '~/features/led-project/presentation/components/led-project-status-badge';

/**
 * Siklus lain milik prodi ini (docs/application_flow.md §5.1c).
 *
 * Sengaja daftar tipis, bukan kartu: dokumen lama tetap harus bisa dibuka —
 * §5.1 mensyaratkan seluruh Dokumen LED prodi terlihat — tapi menampilkannya
 * sebesar siklus berjalan akan mengaburkan mana yang sedang dikerjakan.
 */
export function CycleArchiveList({
	projects,
}: {
	projects: LedProjectEntity[];
}) {
	if (projects.length === 0) return null;

	return (
		<section className="flex flex-col gap-2">
			<h3 className="font-heading text-base font-medium">Riwayat Siklus</h3>
			<ul className="divide-y divide-border rounded-lg ring-1 ring-foreground/10">
				{projects.map((project) => (
					<li key={project.id}>
						<Link
							to={`/led-projects/${project.id}`}
							className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{project.judul}</p>
								<p className="text-xs text-muted-foreground">
									Tahun Akademik {project.tahunAkademik}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<LedProjectStatusBadge status={project.statusKeseluruhan} />
								<CaretRightIcon className="size-4 text-muted-foreground" />
							</div>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
