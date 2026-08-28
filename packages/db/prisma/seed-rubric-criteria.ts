/**
 * Seed rubric_criteria/rubric_levels/rubric_criterion_chapters dari matriks
 * penilaian AMI asli (apps/ai/data/rubric_cache/matrix.json, sudah diverifikasi
 * 64 indikator lewat POST /upload/matrix) — tabel-tabel ini kosong sejak awal,
 * dan itulah kenapa GENERASI_BAB (worker.py::_build_generasi_prompt) selalu
 * menerima rubric=[] lewat get_rubrik_for_bab.
 *
 * Bukan seed.ts biasa (tidak ikut girang dengan `prisma migrate reset`): ini
 * skrip sekali-jalan yang HANYA menulis tiga tabel ini, dijalankan manual saat
 * datanya perlu di-refresh (mis. matrix.json diunggah ulang dengan revisi).
 *
 * Pemetaan chapterOrder sama seperti rubric-criterion-ami.repository.ts
 * (frontend): indikator 1-61 -> bab 2, 62-64 -> bab 3 — diverifikasi dari
 * led_bab_tabel.json, bukan tebakan.
 *
 * Jalankan: npx tsx prisma/seed-rubric-criteria.ts
 * (atau node --import tsx/esm kalau tsx tidak terpasang sebagai bin)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';

type IndicatorListItem = {
	no: number;
	kriteria: string;
	indikator: string;
	score_type: 'qualitative' | 'quantitative' | 'composite';
	score_criteria: Record<string, string>;
	lkps_table_ref: string[];
};

function chapterOrderFor(no: number): number {
	return no <= 61 ? 2 : 3;
}

async function main() {
	const res = await fetch(`${AI_SERVICE_URL}/assessment/indicators`);
	if (!res.ok) {
		throw new Error(`GET /assessment/indicators gagal: ${res.status}`);
	}
	const indikator: IndicatorListItem[] = await res.json();
	if (indikator.length === 0) {
		throw new Error(
			'apps/ai mengembalikan 0 indikator — matrix.json belum ada isinya (POST /upload/matrix dulu).',
		);
	}
	console.log(`Sumber: ${indikator.length} indikator dari ${AI_SERVICE_URL}/assessment/indicators`);

	// Tulis ulang bersih: skrip ini satu-satunya penulis ketiga tabel ini,
	// jadi replace-semua lebih aman daripada upsert selektif kalau matrix.json
	// direvisi (indikator lama yang hilang tidak akan tertinggal jadi sampah).
	await prisma.$transaction([
		prisma.rubricCriterionChapter.deleteMany({}),
		prisma.rubricLevel.deleteMany({}),
		prisma.rubricCriterion.deleteMany({}),
	]);

	for (const ind of indikator) {
		const criterion = await prisma.rubricCriterion.create({
			data: {
				id: `ami-${ind.no}`,
				criterionCode: String(ind.no),
				description: ind.indikator,
			},
		});

		await prisma.rubricLevel.createMany({
			data: Object.entries(ind.score_criteria).map(([skor, deskripsi]) => ({
				criterionId: criterion.id,
				score: Number(skor),
				description: deskripsi,
			})),
		});

		await prisma.rubricCriterionChapter.create({
			data: {
				criterionId: criterion.id,
				chapterOrder: chapterOrderFor(ind.no),
			},
		});
	}

	const [jumlahKriteria, jumlahLevel, jumlahBab] = await Promise.all([
		prisma.rubricCriterion.count(),
		prisma.rubricLevel.count(),
		prisma.rubricCriterionChapter.count(),
	]);
	console.log(
		`Selesai: ${jumlahKriteria} rubric_criteria, ${jumlahLevel} rubric_levels, ${jumlahBab} rubric_criterion_chapters.`,
	);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
