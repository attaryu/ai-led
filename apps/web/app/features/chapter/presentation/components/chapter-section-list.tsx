import { CheckCircleIcon, SparkleIcon, SpinnerGapIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	chapterSectionStatusLabels,
	type ChapterSectionEntity,
} from '../../domain/entities/chapter-section.entity';

const IKON_STATUS = {
	PENDING: null,
	GENERATING: <SpinnerGapIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />,
	GENERATED: <CheckCircleIcon className="size-3.5 shrink-0 text-primary" weight="fill" />,
	ERROR: <WarningCircleIcon className="size-3.5 shrink-0 text-destructive" weight="fill" />,
} as const;

/** Daftar section (outline) satu bab, tiap baris punya tombol generate sendiri — lihat `useChapterSections`. */
export function ChapterSectionList({
	sections,
	dimatikan,
	onGenerate,
}: {
	sections: ChapterSectionEntity[];
	dimatikan: boolean;
	onGenerate: (sectionId: string) => void;
}) {
	return (
		<ul className="space-y-1 rounded-md border border-border p-1.5">
			{sections.map((section) => {
				const sedangJalan = section.status === 'GENERATING';
				return (
					<li
						key={section.id}
						className="flex items-start justify-between gap-2 rounded px-1.5 py-1"
					>
						<div className="min-w-0 flex-1">
							<p className="truncate text-xs font-medium" title={section.judul}>
								{section.urutan}. {section.judul}
							</p>
							<p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
								{IKON_STATUS[section.status]}
								{chapterSectionStatusLabels[section.status]}
							</p>
							{section.status === 'ERROR' && section.error && (
								<p className="mt-0.5 text-[11px] leading-relaxed text-destructive">
									{section.error}
								</p>
							)}
						</div>

						<Button
							type="button"
							size="xs"
							variant={section.status === 'GENERATED' ? 'outline' : 'default'}
							onClick={() => onGenerate(section.id)}
							disabled={dimatikan || sedangJalan}
							className="shrink-0"
						>
							<SparkleIcon />
							{section.status === 'GENERATED' ? 'Ulang' : 'Generate'}
						</Button>
					</li>
				);
			})}
		</ul>
	);
}
