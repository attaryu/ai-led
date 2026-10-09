import {
	type SectionDraftEntity,
} from '../../../domain/entities/section-draft.entity';
import { mapKontenBody } from '../../backend-mappers';
import { chapterRemoteSource, type BackendSectionDraft } from './chapter.remote-source';

export function mapSectionDraft(row: BackendSectionDraft): SectionDraftEntity {
	return {
		id: row.id,
		sectionId: row.sectionId,
		versi: row.version,
		label: row.label,
		sumber: row.source,
		dibuatOlehNama: row.createdByName,
		dibuatPada: row.createdAt,
		konten: mapKontenBody(row.contentSnapshot),
		aktif: row.isActive ?? false,
	};
}

export const sectionDraftRemoteSource = {
	async findBySectionId(chapterId: string, sectionId: string): Promise<SectionDraftEntity[]> {
		const rows = await chapterRemoteSource.findSectionDrafts(chapterId, sectionId);
		return rows.map(mapSectionDraft);
	},
};
