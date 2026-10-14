import * as React from 'react';

import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { assessmentOverviewRepository } from '../../data/repositories/assessment-overview.repository';
import { type AssessmentOverviewEntity } from '../../domain/entities/assessment-overview.entity';

export type DocumentAmiOverview =
	| { status: 'tersembunyi' }
	| { status: 'memuat' }
	| { status: 'siap'; overview: AssessmentOverviewEntity | null };

/**
 * Ringkasan AMI satu dokumen. Endpoint-nya lintas prodi, jadi hasilnya
 * disaring ke `dokumenId` (pola yang sama dengan `useProgramAmiOverview`).
 *
 * `tersembunyi` = role tanpa hak baca atau ringkasan gagal dimuat (mis. 403):
 * tidak boleh menggambar apa pun, sebab "Belum dinilai" akan terbaca "sudah
 * dicek, kosong" padahal tidak pernah dicek. `memuat` hanya untuk role yang
 * berhak, supaya pemanggil bisa memesan ruang tanpa menggambar isinya. Hanya
 * Pimpinan dan Penjamin Mutu yang memanggil endpoint-nya.
 */
export function useDocumentAmiOverview(dokumenId: string): DocumentAmiOverview {
	const role = useSession()?.role;
	const boleh = role === 'Penjamin Mutu' || role === 'Pimpinan';
	// `undefined` = belum tiba, `null` = gagal.
	const [semua, setSemua] = React.useState<
		AssessmentOverviewEntity[] | null | undefined
	>(undefined);

	React.useEffect(() => {
		if (!boleh) return;
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
	}, [boleh]);

	return React.useMemo((): DocumentAmiOverview => {
		if (!boleh || semua === null) return { status: 'tersembunyi' };
		if (semua === undefined) return { status: 'memuat' };
		return {
			status: 'siap',
			overview: semua.find((o) => o.dokumenId === dokumenId) ?? null,
		};
	}, [boleh, semua, dokumenId]);
}
