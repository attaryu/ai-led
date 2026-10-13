import { mapOverview } from '../backend-mappers';
import { assessmentRemoteSource } from '../sources/remote/assessment.remote-source';
import { type AssessmentOverviewEntity } from '../../domain/entities/assessment-overview.entity';

/**
 * Ringkasan penilaian AMI seluruh Dokumen LED tenant, satu panggilan —
 * sumber blok "Penilaian AMI" di Dashboard Utama. Hanya Pimpinan dan Penjamin
 * Mutu yang boleh membacanya; role lain mendapat 403 dari `apiFetch`.
 */
export const assessmentOverviewRepository = {
	async findOverview(): Promise<AssessmentOverviewEntity[]> {
		const rows = await assessmentRemoteSource.findOverview();
		return rows.map(mapOverview);
	},
};
