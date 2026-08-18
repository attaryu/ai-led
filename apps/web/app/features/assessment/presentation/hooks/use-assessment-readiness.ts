import * as React from 'react';

import { chapterRepository } from '~/features/chapter/data/repositories/chapter.repository';
import { hasKonten } from '~/features/chapter/domain/entities/chapter.entity';
import { findAllKriteria } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { evidenceRepository } from '~/features/evidence/data/repositories/evidence.repository';
import { type EvidenceEntity } from '~/features/evidence/domain/entities/evidence.entity';
import {
	hitungKesiapan,
	SUMBER_AWAL,
	type AssessmentSource,
} from '../../domain/entities/assessment-source.entity';

/** Ekstensi yang masuk akal untuk LKPS dan Laporan AK — keduanya berkas Excel. */
const EKSTENSI_TABULAR = ['xls', 'xlsx'];

/**
 * Sumber bahan penilaian beserta kesiapannya.
 *
 * Sumbernya **state halaman, bukan tersimpan**, sampai penilaian dijalankan —
 * saat itulah ia ikut membeku ke dalam sesi. Alasannya: pilihan yang belum
 * dipakai belum menjelaskan apa pun, dan menyimpannya lebih awal membuat sesi
 * lama tampak seolah dijalankan dengan berkas yang sebenarnya baru dipilih
 * kemarin. Nilai awalnya diambil dari sesi terakhir supaya penilaian ulang tidak
 * memaksa pengguna memilih berkas yang sama lagi.
 */
export function useAssessmentReadiness({
	projectId,
	studyProgramId,
	sumberTerakhir,
}: {
	projectId: string;
	studyProgramId: string;
	/** Sumber sesi terakhir; dipakai sebagai nilai awal. */
	sumberTerakhir: AssessmentSource | undefined;
}) {
	/**
	 * `null` berarti pengguna belum menyentuh apa pun, sehingga pilihannya
	 * **mengikuti** sesi terakhir.
	 *
	 * Sengaja bukan `useState(sumberTerakhir ?? SUMBER_AWAL)`: sesi dibaca di
	 * `useEffect`, jadi pada render pertama `sumberTerakhir` selalu `undefined` dan
	 * nilai awal itu akan terkunci ke keadaan kosong selamanya — pengguna harus
	 * memilih ulang berkas yang sama tiap kali membuka halaman.
	 */
	const [dipilih, setDipilih] = React.useState<AssessmentSource | null>(null);
	const sumber = dipilih ?? sumberTerakhir ?? SUMBER_AWAL;

	const [berkas, setBerkas] = React.useState<EvidenceEntity[]>([]);
	const [babTerisi, setBabTerisi] = React.useState(0);
	const [totalBab, setTotalBab] = React.useState(0);

	const muat = React.useCallback(() => {
		const chapters = chapterRepository.findByProjectId(projectId);
		setTotalBab(chapters.length);
		setBabTerisi(chapters.filter(hasKonten).length);

		// Hanya berkas prodi ini: LKPS adalah Laporan Kinerja **Program Studi**,
		// jadi berkas milik tenant tidak pernah jadi kandidat yang benar walau
		// kebetulan berupa Excel.
		setBerkas(
			evidenceRepository
				.findAll()
				.filter(
					(item) =>
						item.ownerTipe === 'PROGRAM_STUDI' &&
						item.studyProgramId === studyProgramId,
				),
		);
	}, [projectId, studyProgramId]);

	React.useEffect(() => {
		muat();
		window.addEventListener('storage-update', muat);
		return () => window.removeEventListener('storage-update', muat);
	}, [muat]);

	/**
	 * Kandidat berkas tabular, yang sudah `SIAP` di atas.
	 *
	 * Yang belum siap tetap ditampilkan, tidak disaring habis: berkas yang baru
	 * diunggah butuh waktu sampai ekstraksinya selesai, dan menyembunyikannya
	 * membuat pengguna mengira unggahannya gagal. Yang menahan tombol jalankan
	 * bukan daftar ini melainkan kesiapan di bawah.
	 */
	const kandidat = React.useMemo(
		() =>
			berkas
				.filter((item) =>
					EKSTENSI_TABULAR.includes(item.tipeFile.toLowerCase()),
				)
				.sort((a, b) => {
					if (a.status !== b.status) return a.status === 'SIAP' ? -1 : 1;
					return b.waktuDiunggah.localeCompare(a.waktuDiunggah);
				}),
		[berkas],
	);

	const cariNama = React.useCallback(
		(id: string | null) =>
			id ? (berkas.find((item) => item.id === id)?.namaDokumen ?? null) : null,
		[berkas],
	);

	const kesiapan = React.useMemo(
		() =>
			hitungKesiapan({
				sumber,
				jumlahIndikator: findAllKriteria().length,
				babTerisi,
				totalBab,
				namaLkps: cariNama(sumber.lkpsBuktiDukungId),
				namaLaporan: cariNama(sumber.laporanBuktiDukungId),
				projectId,
				studyProgramId,
			}),
		[sumber, babTerisi, totalBab, cariNama, projectId, studyProgramId],
	);

	return {
		sumber,
		setSumber: setDipilih,
		kandidat,
		kesiapan,
		babTerisi,
		totalBab,
	};
}
