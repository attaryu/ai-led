import * as React from 'react';

import { assessmentOverviewRepository } from '~/features/assessment/data/repositories/assessment-overview.repository';
import { type AssessmentOverviewEntity } from '~/features/assessment/domain/entities/assessment-overview.entity';

/**
 * Ringkasan AMI untuk dokumen satu prodi. Endpoint-nya lintas prodi, jadi
 * hasilnya disaring ke `dokumenIds`. Bila gagal (mis. role tanpa izin) hasilnya
 * `null`: tabel tetap tampil dan kolom AMI-nya jadi "—", bukan halaman kosong.
 */
export function useProgramAmiOverview(
	dokumenIds: string[],
): AssessmentOverviewEntity[] | null {
	const [semua, setSemua] = React.useState<AssessmentOverviewEntity[] | null>(null);

	React.useEffect(() => {
		let cancelled = false;
		const load = () => {
			assessmentOverviewRepository
				.findOverview()
				.then((overviews) => {
					if (!cancelled) setSemua(overviews);
				})
				.catch(() => {
					if (!cancelled) setSemua(null);
				});
		};
		load();
		window.addEventListener('storage-update', load);
		return () => {
			cancelled = true;
			window.removeEventListener('storage-update', load);
		};
	}, []);

	const kunci = dokumenIds.join(',');
	return React.useMemo(
		() => semua?.filter((overview) => kunci.split(',').includes(overview.dokumenId)) ?? null,
		[semua, kunci],
	);
}
