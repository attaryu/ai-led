import * as React from 'react';

import { type RubricCriterion } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { assessmentSessionRepository } from '../../data/repositories/assessment-session.repository';
import { rubricCriterionAmiRepository } from '../../data/repositories/rubric-criterion-ami.repository';
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
	const [kriteria, setKriteria] = React.useState<RubricCriterion[]>([]);

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

	React.useEffect(() => {
		rubricCriterionAmiRepository.findAll().then(setKriteria);
	}, []);

	/**
	 * Seluruh 64 indikator matriks selalu tampil, sesi ada atau belum —
	 * dokumen yang belum pernah dinilai bukan berarti tidak ada apa pun untuk
	 * dilihat, cuma belum ada hasil AI-nya (`gabungPenilaian` menandai baris
	 * begini `skorFinal: null`, BUKAN "perlu diperiksa" — lihat catatan
	 * `gagal` di sana). Ini yang membuat daftar indikator bisa dipilih dan
	 * dinilai sebagian (bukan wajib nilai 64 sekaligus) tanpa perlu kartu
	 * pemilih indikator yang terpisah dari daftar hasil.
	 */
	const baris = React.useMemo(
		() => gabungPenilaian({ kriteria, hasil, keputusan }),
		[kriteria, hasil, keputusan],
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
