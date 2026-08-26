import * as React from 'react';

import { findAllKriteria } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { assessmentVerdictRepository } from '../../data/repositories/assessment-verdict.repository';
import {
	gabungPenilaian,
	ringkasPenilaian,
	type AssessmentSessionEntity,
} from '../../domain/entities/assessment-session.entity';
import { type AssessmentVerdictEntity } from '../../domain/entities/assessment-verdict.entity';
import { type IndicatorResultEntity } from '../../domain/entities/indicator-result.entity';
import { type AssessmentPermission } from './use-assessment-permission';

/**
 * Tabel penilaian final untuk satu sesi: hasil AI ditimpa keputusan Penjamin
 * Mutu, digabung dengan master indikator.
 *
 * **Keputusan dibaca per dokumen, hasil dibaca per sesi**, dan perbedaan itu
 * disengaja — itulah yang membuat keputusan bertahan saat penilaian diulang.
 * Sesi lama yang dibuka dari Riwayat pun menampilkan keputusan yang berlaku
 * sekarang, bukan keputusan "versi waktu itu": yang ditanyakan orang saat membuka
 * sesi lama adalah bagaimana angka AI waktu itu dibandingkan keputusan yang
 * berlaku, dan penanda basi yang menjelaskan selisihnya.
 */
export function useAssessmentResults({
	projectId,
	sesi,
	izin,
}: {
	projectId: string;
	sesi: AssessmentSessionEntity | undefined;
	izin: AssessmentPermission;
}) {
	const [hasil, setHasil] = React.useState<IndicatorResultEntity[]>([]);
	const [keputusan, setKeputusan] = React.useState<AssessmentVerdictEntity[]>(
		[],
	);

	const sesiId = sesi?.id;

	const muat = React.useCallback(async () => {
		const [hasilBaru, keputusanBaru] = await Promise.all([
			sesiId
				? assessmentSessionRepository.findResultsBySession(sesiId)
				: Promise.resolve([]),
			assessmentVerdictRepository.findByDokumenId(projectId),
		]);
		setHasil(hasilBaru);
		setKeputusan(keputusanBaru);
	}, [sesiId, projectId]);

	React.useEffect(() => {
		void muat();
	}, [muat]);

	/**
	 * Tanpa sesi, tabelnya kosong — bukan berisi seluruh indikator tanpa skor.
	 *
	 * Bedanya penting: baris tanpa hasil dihitung "perlu diperiksa" karena
	 * indikator yang gagal dinilai memang temuan. Kalau dokumen yang belum pernah
	 * dinilai sama sekali ikut memakai aturan itu, kartu ringkasannya akan
	 * mengumumkan delapan belas temuan sebelum satu pun penilaian dijalankan.
	 */
	const baris = React.useMemo(
		() =>
			sesiId
				? gabungPenilaian({ kriteria: findAllKriteria(), hasil, keputusan })
				: [],
		[sesiId, hasil, keputusan],
	);

	const ringkasan = React.useMemo(() => ringkasPenilaian(baris), [baris]);

	/**
	 * Menyimpan keputusan — menyetujui maupun mengoreksi lewat satu jalur.
	 *
	 * Skor AI dan sesi asalnya diambil dari baris yang sedang dilihat, bukan
	 * dari pemanggil: keduanya harus sepasang agar penanda basi bisa dipercaya.
	 */
	const simpanKeputusan = React.useCallback(
		async (input: { indikatorNo: number; skorFinal: number; catatan: string }) => {
			if (!izin.canCorrect || !sesiId) return;

			await assessmentVerdictRepository.upsert({
				dokumenId: projectId,
				indikatorNo: input.indikatorNo,
				skorFinal: input.skorFinal,
				catatan: input.catatan,
			});
			await muat();
		},
		[izin.canCorrect, sesiId, projectId, muat],
	);

	const cabutKeputusan = React.useCallback(
		async (indikatorNo: number) => {
			if (!izin.canCorrect) return;
			await assessmentVerdictRepository.remove(projectId, indikatorNo);
			await muat();
		},
		[izin.canCorrect, projectId, muat],
	);

	return { baris, ringkasan, simpanKeputusan, cabutKeputusan };
}
