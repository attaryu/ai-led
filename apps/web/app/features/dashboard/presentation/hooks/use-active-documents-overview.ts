import * as React from 'react';

import { assessmentOverviewRepository } from '~/features/assessment/data/repositories/assessment-overview.repository';
import { type AssessmentOverviewEntity } from '~/features/assessment/domain/entities/assessment-overview.entity';
import {
	buildActiveDocumentRows,
	summarizeActiveDocuments,
	type ActiveDocumentRow,
	type ActiveDocumentStats,
} from '../../domain/entities/active-documents.entity';
import { type InstitutionResources } from '../../domain/entities/institution-readiness.entity';
import { useInstitutionReadiness } from './use-institution-readiness';

export type ActiveDocumentsState = {
	/** `false` sampai kesiapan prodi terbaca; jangan tampilkan "kosong" sebelum itu. */
	loaded: boolean;
	adaProdi: boolean;
	rows: ActiveDocumentRow[];
	stats: ActiveDocumentStats;
	/**
	 * Status ringkasan AMI. `error` (mis. role tanpa izin atau backend gagal)
	 * tidak menjatuhkan tabel: kolom dokumen tetap tampil, kolom dan kartu AMI
	 * menyesuaikan.
	 */
	amiStatus: 'loading' | 'ready' | 'error';
	sumberDaya: InstitutionResources;
};

/**
 * Data tabel "Dokumen LED aktif" dan empat kartu di atasnya: menggabungkan
 * kesiapan prodi (bab, tenggat) dengan `GET /assessment/overview`. Berlangganan
 * `storage-update` seperti hook dashboard lain.
 */
export function useActiveDocumentsOverview(): ActiveDocumentsState {
	const { loaded, rows: readiness, sumberDaya } = useInstitutionReadiness();
	const [ami, setAmi] = React.useState<{
		status: ActiveDocumentsState['amiStatus'];
		overviews: AssessmentOverviewEntity[] | null;
	}>({ status: 'loading', overviews: null });

	React.useEffect(() => {
		let cancelled = false;
		const load = () => {
			assessmentOverviewRepository
				.findOverview()
				.then((overviews) => {
					if (!cancelled) setAmi({ status: 'ready', overviews });
				})
				.catch(() => {
					if (!cancelled) setAmi({ status: 'error', overviews: null });
				});
		};
		load();
		window.addEventListener('storage-update', load);
		return () => {
			cancelled = true;
			window.removeEventListener('storage-update', load);
		};
	}, []);

	return React.useMemo(() => {
		const rows = buildActiveDocumentRows({
			readiness,
			overviews: ami.overviews,
		});
		return {
			loaded,
			adaProdi: readiness.length > 0,
			rows,
			stats: summarizeActiveDocuments(rows, ami.status === 'ready'),
			amiStatus: ami.status,
			sumberDaya,
		};
	}, [loaded, readiness, sumberDaya, ami]);
}
