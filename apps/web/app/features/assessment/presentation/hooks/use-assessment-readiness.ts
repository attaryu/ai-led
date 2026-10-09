import * as React from 'react';

import { chapterRepository } from '~/features/chapter/data/repositories/chapter.repository';
import { hasKonten } from '~/features/chapter/domain/entities/chapter.entity';
import { evidenceRepository } from '~/features/evidence/data/repositories/evidence.repository';
import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import { rubricCriterionAmiRepository } from '../../data/repositories/rubric-criterion-ami.repository';
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
	kunciKeDokumen = false,
}: {
	projectId: string;
	studyProgramId: string;
	/** Sumber sesi terakhir; dipakai sebagai nilai awal. */
	sumberTerakhir: AssessmentSource | undefined;
	/**
	 * `true` = sumber penilaian DIKUNCI ke dokumen, bukan dipilih di halaman: LED selalu
	 * "Dari editor" dan LKPS selalu LKPS yang terhubung ke dokumen LED ini. Sesi terakhir
	 * dan pilihan manual diabaikan -- kalau tidak, mengganti LKPS dokumen tidak berpengaruh
	 * ke penilaian berikutnya karena sesi lama masih "menang". Dipakai selama kartu
	 * "Sumber & Kesiapan" disembunyikan.
	 */
	kunciKeDokumen?: boolean;
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
	/** LKPS dokumen ini (kartu "Data LKPS" / Edit Dokumen) -- default pilihan supaya tidak diunggah/dipilih dua kali. */
	const [lkpsDokumen, setLkpsDokumen] = React.useState<string | null>(null);
	const awal = sumberTerakhir ?? SUMBER_AWAL;
	// const sumber = dipilih ?? { ...awal, lkpsBuktiDukungId: awal.lkpsBuktiDukungId ?? lkpsDokumen };
	const sumberBebas = dipilih ?? { ...awal, lkpsBuktiDukungId: awal.lkpsBuktiDukungId ?? lkpsDokumen };
	const sumber: AssessmentSource = kunciKeDokumen
		? {
				sumberLed: 'EDITOR',
				ledFileName: null,
				lkpsBuktiDukungId: lkpsDokumen,
				// Laporan AK ikut tersembunyi bersama kartunya: tanpa ia, seluruh indikator dinilai.
				laporanBuktiDukungId: null,
			}
		: sumberBebas;
	/** `lkpsDokumen === null` berarti "belum dimuat" ATAU "dokumen tanpa LKPS" -- ini yang membedakannya. */
	const [dokumenDimuat, setDokumenDimuat] = React.useState(false);

	const [berkas, setBerkas] = React.useState<EvidenceEntity[]>([]);
	const [lkps, setLkps] = React.useState<EvidenceEntity[]>([]);
	const [babTerisi, setBabTerisi] = React.useState(0);
	const [totalBab, setTotalBab] = React.useState(0);
	const [jumlahIndikator, setJumlahIndikator] = React.useState(0);

	const muat = React.useCallback(async () => {
		const chapters = await chapterRepository.findByProjectId(projectId);
		setTotalBab(chapters.length);
		setBabTerisi(chapters.filter(hasKonten).length);

		// Hanya berkas prodi ini: LKPS adalah Laporan Kinerja **Program Studi**,
		// jadi berkas milik tenant tidak pernah jadi kandidat yang benar walau
		// kebetulan berupa Excel.
		const [buktiDukung, daftarLkps] = await Promise.all([
			evidenceRepository.findOwnedByStudyProgram(studyProgramId),
			evidenceRepository.findLkpsByStudyProgram(studyProgramId),
		]);
		setBerkas(buktiDukung);
		setLkps(daftarLkps);
	}, [projectId, studyProgramId]);

	React.useEffect(() => {
		let dibatalkan = false;
		ledProjectRepository.findById(projectId).then((proyek) => {
			if (!dibatalkan) {
				setLkpsDokumen(proyek?.lkpsEvidenceId ?? null);
				setDokumenDimuat(true);
			}
			return rubricCriterionAmiRepository.findAll(proyek?.accreditationSetId).then((kriteria) => {
				if (!dibatalkan) setJumlahIndikator(kriteria.length);
			});
		});
		return () => {
			dibatalkan = true;
		};
	}, [projectId]);

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
			id ? ([...berkas, ...lkps].find((item) => item.id === id)?.namaDokumen ?? null) : null,
		[berkas, lkps],
	);

	const kesiapan = React.useMemo(
		() =>
			hitungKesiapan({
				sumber,
				jumlahIndikator,
				babTerisi,
				totalBab,
				namaLkps: cariNama(sumber.lkpsBuktiDukungId),
				statusLkps: [...berkas, ...lkps].find((item) => item.id === sumber.lkpsBuktiDukungId)?.status ?? null,
				namaLaporan: cariNama(sumber.laporanBuktiDukungId),
				projectId,
				studyProgramId,
			}),
		[sumber, jumlahIndikator, babTerisi, totalBab, cariNama, berkas, lkps, projectId, studyProgramId],
	);

	/**
	 * Mode terkunci: pemilihan di halaman ini sudah tidak ada, jadi tautan dan keterangan
	 * prasyarat diarahkan ke tempat yang sekarang benar -- LKPS dipilih di Edit Dokumen LED,
	 * dan satu-satunya sumber LED adalah editor (unggah PDF LED tidak ditawarkan).
	 */
	const kesiapanTampil = React.useMemo(() => {
		if (!kunciKeDokumen) return kesiapan;
		const items = kesiapan.items.map((item) => {
			if (item.kunci === 'lkps' && item.state === 'KURANG') {
				return {
					...item,
					keterangan: lkpsDokumen
						? item.keterangan
						: 'Dokumen LED ini belum terhubung ke LKPS. Indikator kuantitatif tidak bisa dinilai tanpa data ini.',
					tautan: { label: 'Pilih LKPS di Edit Dokumen LED', to: `/dashboard/led-projects/${projectId}/edit` },
				};
			}
			if (item.kunci === 'led' && item.state === 'KURANG') {
				return { ...item, keterangan: 'Belum satu pun bab punya tulisan. Tulis di editor.' };
			}
			return item;
		});
		return { ...kesiapan, items };
	}, [kesiapan, kunciKeDokumen, lkpsDokumen, projectId]);

	return {
		sumber,
		/** Sudah tahu apakah dokumen punya LKPS; sebelum itu jangan tampilkan peringatan "belum terhubung". */
		dokumenDimuat,
		setSumber: setDipilih,
		kandidat,
		/** LKPS prodi (kind LKPS) -- terpisah dari kandidat Bukti Dukung tabular untuk Laporan AK. */
		kandidatLkps: lkps,
		// kesiapan,
		kesiapan: kesiapanTampil,
		babTerisi,
		totalBab,
	};
}
