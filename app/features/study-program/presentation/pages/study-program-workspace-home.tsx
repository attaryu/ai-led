import * as React from 'react';
import { CaretRightIcon } from '@phosphor-icons/react';
import { Link, useParams } from 'react-router';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import { type LedProjectEntity } from '~/features/led-project/domain/entities/led-project.entity';

const statusStyles: Record<string, string> = {
	DRAFT: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
	REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
	SELESAI:
		'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

/**
 * Daftar Dokumen LED milik satu prodi (docs/application_flow.md §5.1) — untuk
 * sekarang sebatas penaut ke Lapis 3; ringkasan progres per bab menyusul.
 */
export function StudyProgramWorkspaceHome() {
	const { programId } = useParams<{ programId: string }>();
	const [ledProjects, setLedProjects] = React.useState<LedProjectEntity[]>([]);

	const loadData = React.useCallback(() => {
		if (!programId) return;
		setLedProjects(ledProjectRepository.findByStudyProgramId(programId));
	}, [programId]);

	React.useEffect(() => {
		loadData();
		window.addEventListener('storage-update', loadData);
		return () => {
			window.removeEventListener('storage-update', loadData);
		};
	}, [loadData]);

	if (ledProjects.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Belum ada Dokumen LED</CardTitle>
					<CardDescription>
						Prodi ini belum punya Dokumen LED. Dokumen baru dibuat oleh Penjamin
						Mutu lewat Dashboard Utama.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{ledProjects.map((project) => (
				<Link key={project.id} to={`/led-projects/${project.id}`} className="group">
					<Card className="h-full transition-colors group-hover:border-primary">
						<CardHeader>
							<div className="flex items-start justify-between gap-3">
								<CardTitle className="text-base">{project.judul}</CardTitle>
								<CaretRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
							</div>
							<CardDescription>
								Tahun Akademik {project.tahunAkademik}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<span
								className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
									statusStyles[project.statusKeseluruhan] ?? ''
								}`}
							>
								{project.statusKeseluruhan}
							</span>
						</CardContent>
					</Card>
				</Link>
			))}
		</div>
	);
}
