import * as React from 'react';

import {
	findAllKriteria,
	skorMaksimal,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { runAssessment } from '../../data/sources/remote/assessment-run.mock';
import { type AssessmentSessionEntity } from '../../domain/entities/assessment-session.entity';
import { type AssessmentSource } from '../../domain/entities/assessment-source.entity';
import { type AssessmentPermission } from './use-assessment-permission';

export type StatusPenilaian = 'diam' | 'berjalan' | 'gagal';

/**
 * Daftar sesi penilaian satu dokumen, sesi yang sedang dilihat, dan penjalanan
 * penilaian itu sendiri.
 *
 * Sesi yang dilihat hidup di URL (`?sesi=`), bukan di state: membuka satu baris
 * riwayat harus menghasilkan tautan yang bisa dikirim ke orang lain, dan
 * pertanyaan "kita sedang membahas hasil yang mana" adalah pertanyaan pertama
 * dalam setiap percakapan tentang penilaian.
 */
export function useAssessmentSession({
	projectId,
	sesiIdTerpilih,
	izin,
}: {
	projectId: string;
	/** Dari `?sesi=`; `null` berarti sesi terbaru. */
	sesiIdTerpilih: string | null;
	izin: AssessmentPermission;
}) {
	const [daftarSesi, setDaftarSesi] = React.useState<AssessmentSessionEntity[]>(
		[],
	);
	const [status, setStatus] = React.useState<StatusPenilaian>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	const muat = React.useCallback(() => {
		setDaftarSesi(assessmentSessionRepository.findByDokumenId(projectId));
	}, [projectId]);

	React.useEffect(() => {
		muat();
		window.addEventListener('storage-update', muat);
		return () => window.removeEventListener('storage-update', muat);
	}, [muat]);

	// Sesi yang ditunjuk URL tapi sudah tidak ada jatuh kembali ke yang terbaru,
	// alih-alih menampilkan halaman kosong tanpa penjelasan.
	const sesiAktif =
		daftarSesi.find((sesi) => sesi.id === sesiIdTerpilih) ?? daftarSesi[0];

	/** Sesi terbaru yang sedang dilihat — hanya itu yang boleh dinilai ulang. */
	const melihatSesiTerbaru =
		sesiAktif !== undefined && sesiAktif.id === daftarSesi[0]?.id;

	const jalankan = React.useCallback(
		async (sumber: AssessmentSource) => {
			if (!izin.canRun || !izin.session || status === 'berjalan') return;

			const konten = assessmentSessionRepository.rakitKonten(projectId, sumber);
			if (konten.trim() === '') {
				setStatus('gagal');
				setPesanGagal(
					'Belum ada tulisan yang bisa dinilai. Isi bab di editor, atau unggah PDF LED bila dokumennya disusun di luar aplikasi.',
				);
				return;
			}

			setStatus('berjalan');
			setPesanGagal(null);

			const sesi = assessmentSessionRepository.create({
				dokumenId: projectId,
				sumber,
				dijalankanOlehUserId: izin.session.userId,
				dijalankanOlehNama: izin.session.namaLengkap,
			});

			try {
				await runAssessment({
					konten,
					kriteria: findAllKriteria().map((kriteria) => ({
						no: kriteria.no,
						kodeKriteria: kriteria.kodeKriteria,
						skorMaksimal: skorMaksimal(kriteria),
						tipeSkor: kriteria.tipeSkor,
					})),
					onIndicator: (hasil) => {
						assessmentSessionRepository.appendResult(sesi.id, hasil);
					},
				});

				assessmentSessionRepository.finish(sesi.id);
				setStatus('diam');
			} catch {
				const pesan =
					'Penilaian gagal diselesaikan. Periksa koneksi lalu jalankan ulang.';
				// Sesinya ditandai gagal, bukan dihapus: hasil indikator yang telanjur
				// selesai tetap fakta yang sah, dan sesi yang lenyap membuat pengguna
				// mengira penilaiannya tidak pernah berjalan sama sekali.
				assessmentSessionRepository.fail(sesi.id, pesan);
				setStatus('gagal');
				setPesanGagal(pesan);
			}
		},
		[izin.canRun, izin.session, status, projectId],
	);

	/**
	 * Isi yang dinilai **sesi ini**, bukan isi yang akan dinilai berikutnya.
	 *
	 * Dirakit dari `sesiAktif.sumber`, bukan dari pilihan yang sedang tampil di
	 * kartu Sumber: evaluasi RAGAS harus menggambarkan penilaian yang sudah
	 * terjadi. Dipulangkan dari hook ini supaya halaman tidak perlu memanggil
	 * repository sendiri.
	 */
	const kontenSesi = React.useMemo(
		() =>
			sesiAktif
				? assessmentSessionRepository.rakitKonten(projectId, sesiAktif.sumber)
				: '',
		[sesiAktif, projectId],
	);

	return {
		daftarSesi,
		sesiAktif,
		melihatSesiTerbaru,
		kontenSesi,
		status,
		pesanGagal,
		jalankan,
	};
}
