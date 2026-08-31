import * as React from 'react';

import {
	deriveSetLock,
	type AccreditationSetEntity,
	type SetLock,
} from '../../domain/entities/accreditation-set.entity';
import { accreditationSetRepository } from '../../data/repositories/accreditation-set.repository';

export type AccreditationSetView = {
	set: AccreditationSetEntity | null;
	/** Jumlah Dokumen LED yang memakai set ini. */
	dipakai: number;
	/** `null` selama set belum termuat — belum ada yang bisa dikunci. */
	lock: SetLock | null;
	notFound: boolean;
	memuat: boolean;
	reload: () => void;
};

/**
 * Memuat satu set beserta keadaan penguncian yang berlaku untuknya.
 *
 * Dipakai bersama halaman detail dan halaman kriteria: keduanya butuh trio yang
 * sama (set, jumlah pemakai, kunci), dan menghitungnya sendiri-sendiri berarti
 * dua tempat yang bisa berbeda pendapat tentang apakah sebuah set masih boleh
 * disunting.
 *
 * Jumlah pemakai diambil bersamaan, bukan belakangan, supaya tidak ada jendela
 * waktu ketika halaman sudah tampil tapi tombolnya masih menganggap set ini
 * bebas diubah.
 */
export function useAccreditationSet(
	setId: string | undefined,
): AccreditationSetView {
	const [set, setSet] = React.useState<AccreditationSetEntity | null>(null);
	const [dipakai, setDipakai] = React.useState(0);
	const [notFound, setNotFound] = React.useState(false);
	const [memuat, setMemuat] = React.useState(true);

	const reload = React.useCallback(() => {
		if (!setId) {
			setNotFound(true);
			setMemuat(false);
			return;
		}

		Promise.all([
			accreditationSetRepository.findById(setId),
			accreditationSetRepository.countUsage(setId),
		]).then(([found, jumlah]) => {
			setMemuat(false);

			if (!found) {
				setNotFound(true);
				return;
			}

			setSet(found);
			setDipakai(jumlah);
		});
	}, [setId]);

	React.useEffect(() => {
		reload();
	}, [reload]);

	return {
		set,
		dipakai,
		lock: set ? deriveSetLock(dipakai) : null,
		notFound,
		memuat,
		reload,
	};
}
