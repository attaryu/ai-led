import { type AssessmentOverviewEntity } from '~/features/assessment/domain/entities/assessment-overview.entity';
import { type ChapterSummary } from '~/features/chapter/domain/entities/chapter.entity';
import {
	type LedProjectEntity,
	type ProjectDeadline,
} from '~/features/led-project/domain/entities/led-project.entity';
import { type StudyProgramEntity } from '~/features/study-program/domain/entities/study-program.entity';
import {
	compareDeadlines,
	type ProgramReadinessRow,
} from './institution-readiness.entity';

/**
 * Baris tabel "Dokumen LED aktif" di Dashboard Utama: satu per Dokumen LED yang
 * **sedang disusun** (`pickPenyusunanAktif` per prodi, status keseluruhan bukan
 * SELESAI), memuat kemajuan penyusunan, tenggat, dan penilaian AMI terbarunya.
 *
 * Hasil mesin dan peninjauan Penjamin Mutu sengaja tetap dua fakta terpisah
 * (`skorRataRata` vs `ditinjau`/`dikoreksi`); tidak ada angka gabungan, tidak
 * ada rata-rata lintas institusi, dan tidak ada peringkat akreditasi.
 */
export type ActiveDocumentRow = {
	project: LedProjectEntity;
	program: StudyProgramEntity;
	chapterSummary: ChapterSummary;
	/** `null` bila dokumen tidak dipatok tenggat. */
	tenggat: ProjectDeadline | null;
	/** `null` bila belum ada ringkasan (atau ringkasan AMI tidak tersedia). */
	overview: AssessmentOverviewEntity | null;
	/** Indikator yang belum ditinjau Penjamin Mutu; 0 bila sesi belum selesai. */
	belumDitinjau: number;
	/** Skor rendah (≤ 2) ditambah indikator gagal pada sesi terbaru. */
	perluPerhatian: number;
};

/**
 * Empat angka kartu. Satuannya **dokumen**, tidak pernah bab atau indikator:
 * tiap dokumen punya jumlah bab dan rubrik yang berbeda, jadi menjumlahkan
 * sub-unit lintas dokumen menghasilkan angka yang tidak bermakna.
 *
 * Dua angka AMI bernilai `null` bila ringkasan AMI belum/tidak tersedia —
 * bukan nol, karena nol berarti "sudah dicek dan tidak ada".
 */
export type ActiveDocumentStats = {
	dokumenAktif: number;
	/** Tenggat LEWAT atau DEKAT. */
	tenggatMendesak: number;
	/** Bagian dari {@link tenggatMendesak} yang sudah LEWAT. */
	terlambat: number;
	/** Sesi terbaru COMPLETED dan belum seluruh indikatornya ditinjau. */
	perluDitinjau: number | null;
	/** Sesi terbaru punya skor rendah atau indikator gagal. */
	perluPerhatian: number | null;
};

/**
 * Menggabungkan baris kesiapan (bab + tenggat) dengan ringkasan AMI per
 * dokumen. `overviews = null` berarti endpoint AMI gagal atau belum dimuat:
 * baris tetap dibangun, kolom AMI-nya kosong.
 *
 * Urutan, menurut apa yang butuh perhatian lebih dulu:
 * 1. tenggat paling menekan di atas (LEWAT, DEKAT, AMAN; tanpa tenggat
 *    terakhir) — {@link compareDeadlines};
 * 2. seri diputus oleh indikator belum ditinjau terbanyak;
 * 3. seri berikutnya diputus oleh nama prodi.
 */
export function buildActiveDocumentRows(input: {
	readiness: ProgramReadinessRow[];
	overviews: AssessmentOverviewEntity[] | null;
}): ActiveDocumentRow[] {
	const overviewByDoc = new Map(
		(input.overviews ?? []).map((overview) => [overview.dokumenId, overview]),
	);

	const rows: ActiveDocumentRow[] = [];
	for (const { program, penyusunanAktif, chapterSummary, tenggat } of input.readiness) {
		if (!penyusunanAktif) continue;

		const overview = overviewByDoc.get(penyusunanAktif.id) ?? null;
		const selesai = overview?.sesi?.status === 'COMPLETED';
		rows.push({
			project: penyusunanAktif,
			program,
			chapterSummary,
			tenggat,
			overview,
			belumDitinjau:
				overview?.sesi && selesai
					? Math.max(0, overview.sesi.totalIndicators - overview.ditinjau)
					: 0,
			perluPerhatian: overview ? overview.jumlahSkorRendah + overview.gagal : 0,
		});
	}

	return rows.sort(
		(a, b) =>
			compareDeadlines(a.tenggat, b.tenggat) ||
			b.belumDitinjau - a.belumDitinjau ||
			a.program.studyProgramName.localeCompare(b.program.studyProgramName),
	);
}

export function summarizeActiveDocuments(
	rows: ActiveDocumentRow[],
	amiTersedia: boolean,
): ActiveDocumentStats {
	const terlambat = rows.filter((row) => row.tenggat?.urgensi === 'LEWAT').length;
	const dekat = rows.filter((row) => row.tenggat?.urgensi === 'DEKAT').length;

	return {
		dokumenAktif: rows.length,
		tenggatMendesak: terlambat + dekat,
		terlambat,
		perluDitinjau: amiTersedia
			? rows.filter((row) => row.belumDitinjau > 0).length
			: null,
		perluPerhatian: amiTersedia
			? rows.filter((row) => row.perluPerhatian > 0).length
			: null,
	};
}
