import * as React from 'react';

import { assessmentSessionRepository } from '~/features/assessment/data/repositories/assessment-session.repository';
import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import { type LedProjectEntity } from '~/features/led-project/domain/entities/led-project.entity';
import { useSession } from '~/features/auth/presentation/hooks/use-session';
import { accreditationSetRepository } from '../../data/repositories/accreditation-set.repository';
import { type AccreditationSetEntity } from '../../domain/entities/accreditation-set.entity';

/**
 * Apakah dokumen ini sudah pernah dinilai sungguhan.
 *
 * Penilaian yang **gagal** sengaja tidak dihitung: tidak ada satu pun skor yang
 * lahir darinya, jadi tidak ada yang bisa kehilangan arti bila acuannya diganti
 * sesudah itu. Menghitungnya hanya akan membekukan pilihan yang keliru gara-gara
 * satu percobaan yang memang tidak menghasilkan apa-apa.
 */
function pernahDinilai(dokumenId: string): boolean {
	return assessmentSessionRepository
		.findByDokumenId(dokumenId)
		.some((sesi) => sesi.status === 'RUNNING' || sesi.status === 'COMPLETED');
}

/**
 * Acuan penilaian satu Dokumen LED beserta aturan yang berlaku atasnya.
 *
 * Dipakai bersama oleh lencana di kepala halaman dan kartu detail di kolom
 * kanan. Keduanya menampilkan set yang sama, dan memisahkan pemuatannya berarti
 * dua tempat yang bisa berbeda pendapat tentang acuan apa yang sedang dipakai —
 * termasuk sesaat setelah acuannya diganti dari kartu.
 */
export function useProjectAccreditationSet(project: LedProjectEntity) {
	const session = useSession();
	const [set, setSet] = React.useState<AccreditationSetEntity | null>(null);
	const [sudahDinilai, setSudahDinilai] = React.useState(false);
	const [acuanId, setAcuanId] = React.useState(project.accreditationSetId);

	React.useEffect(() => {
		setAcuanId(project.accreditationSetId);
	}, [project.accreditationSetId]);

	React.useEffect(() => {
		setSudahDinilai(pernahDinilai(project.id));

		if (!acuanId) {
			setSet(null);
			return;
		}

		accreditationSetRepository
			.findById(acuanId)
			.then((ditemukan) => setSet(ditemukan ?? null));
	}, [project.id, acuanId]);

	const pilih = React.useCallback(
		(dipilih: AccreditationSetEntity) => {
			ledProjectRepository.setAccreditationSet(project.id, dipilih.id);
			setAcuanId(dipilih.id);
			setSet(dipilih);
		},
		[project.id],
	);

	return {
		set,
		sudahDinilai,
		/**
		 * Memilih acuan adalah keputusan tata kelola, bukan keputusan menulis, jadi
		 * hanya Penjamin Mutu yang boleh — mengikuti pola bahwa hanya role itu yang
		 * boleh menghapus dokumen. Ikut tertutup begitu dokumen pernah dinilai,
		 * karena skor yang tersimpan mengacu pada kriteria milik set saat itu.
		 */
		bolehMengganti: session?.role === 'Penjamin Mutu' && !sudahDinilai,
		pilih,
	};
}
