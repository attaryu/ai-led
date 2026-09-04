/**
 * Seed accreditation_sets/rubric_criteria/rubric_levels/rubric_criterion_chapters
 * dari matriks penilaian AMI asli (apps/ai/data/rubric_cache/matrix.json, sudah
 * diverifikasi 64 indikator lewat POST /upload/matrix).
 *
 * Sejak Set Akreditasi ada, RubricCriterion WAJIB punya accreditationSetId — jadi
 * skrip ini sekarang juga bikin/pakai satu AccreditationSet default ("LAM Teknik
 * (Default)") dan menaruh ke-64 kriteria di bawahnya, plus mem-backfill
 * writing_led_documents yang belum pilih set ke set default ini (data lama, dari
 * sebelum Set Akreditasi ada).
 *
 * Tenant: pakai tenant pertama yang ada di DB (fallback ke 'demo-tenant' seperti
 * seed.ts) — cukup untuk dev/demo satu-tenant. Migrasi produksi multi-tenant
 * sungguhan perlu satu set default PER TENANT, bukan satu set global; skrip ini
 * TIDAK menghitung itu.
 *
 * Bukan seed.ts biasa (tidak ikut girang dengan `prisma migrate reset`): ini
 * skrip sekali-jalan, dijalankan manual saat datanya perlu di-refresh (mis.
 * matrix.json diunggah ulang dengan revisi). Kriteria/level/bab ditulis-ulang
 * bersih tiap jalan; set default & backfill dokumen memakai upsert supaya aman
 * dijalankan berulang.
 *
 * Pemetaan chapterOrder sama seperti rubric-criterion-ami.repository.ts
 * (frontend): indikator 1-61 -> bab 2, 62-64 -> bab 3 — diverifikasi dari
 * led_bab_tabel.json, bukan tebakan.
 *
 * Jalankan: npx tsx prisma/seed-rubric-criteria.ts
 * (atau node --import tsx/esm kalau tsx tidak terpasang sebagai bin)
 */
import { PrismaClient, RubricScoreType } from '@prisma/client';

const prisma = new PrismaClient();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
const DEFAULT_SET_ID = 'accreditation-set-lam-teknik-default';
const FALLBACK_TENANT_ID = 'demo-tenant';

type IndicatorListItem = {
	no: number;
	kriteria: string;
	indikator: string;
	score_type: 'qualitative' | 'quantitative' | 'composite';
	score_criteria: Record<string, string>;
	lkps_table_ref: string[];
	formula: string | null;
	sub_score_formula: string | null;
};

const SCORE_TYPE_MAP: Record<IndicatorListItem['score_type'], RubricScoreType> = {
	qualitative: RubricScoreType.KUALITATIF,
	quantitative: RubricScoreType.KUANTITATIF,
	composite: RubricScoreType.KOMPOSIT,
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

	const tenant =
		(await prisma.tenant.findFirst()) ??
		(await prisma.tenant.upsert({
			where: { id: FALLBACK_TENANT_ID },
			update: {},
			create: { id: FALLBACK_TENANT_ID, universityName: 'Universitas Contoh' },
		}));

	const defaultSet = await prisma.accreditationSet.upsert({
		where: { id: DEFAULT_SET_ID },
		update: {},
		create: {
			id: DEFAULT_SET_ID,
			tenantId: tenant.id,
			nama: 'LAM Teknik (Default)',
			lembaga: 'LAM Teknik',
			tahunSiklus: new Date().getFullYear(),
			status: 'SIAP',
		},
	});

	// Tulis ulang bersih kriteria/level/bab set default ini: skrip ini
	// satu-satunya penulis untuk set ini, jadi replace-semua lebih aman
	// daripada upsert selektif kalau matrix.json direvisi (indikator lama
	// yang hilang tidak akan tertinggal jadi sampah). Set lain (kustom user)
	// tidak tersentuh.
	await prisma.$transaction([
		prisma.rubricCriterionChapter.deleteMany({
			where: { criterion: { accreditationSetId: defaultSet.id } },
		}),
		prisma.rubricLevel.deleteMany({ where: { criterion: { accreditationSetId: defaultSet.id } } }),
		prisma.rubricCriterion.deleteMany({ where: { accreditationSetId: defaultSet.id } }),
	]);

	for (const ind of indikator) {
		const criterion = await prisma.rubricCriterion.create({
			data: {
				id: `ami-${ind.no}`,
				accreditationSetId: defaultSet.id,
				indicatorNo: ind.no,
				criterionCode: String(ind.no),
				criterionGroup: ind.kriteria,
				description: ind.indikator,
				scoreType: SCORE_TYPE_MAP[ind.score_type],
				lkpsTableRefs: ind.lkps_table_ref,
				formula: ind.formula,
				subScoreFormula: ind.sub_score_formula,
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

	// Data lama (LedDocument dibuat sebelum Set Akreditasi ada) belum pilih
	// set apa pun -- arahkan ke set default ini supaya tab Rubrik/Panduan dan
	// riwayat penilaiannya tidak yatim.
	const { count: jumlahDibackfill } = await prisma.ledDocument.updateMany({
		where: { accreditationSetId: null },
		data: { accreditationSetId: defaultSet.id },
	});

	const [jumlahKriteria, jumlahLevel, jumlahBab] = await Promise.all([
		prisma.rubricCriterion.count({ where: { accreditationSetId: defaultSet.id } }),
		prisma.rubricLevel.count({ where: { criterion: { accreditationSetId: defaultSet.id } } }),
		prisma.rubricCriterionChapter.count({
			where: { criterion: { accreditationSetId: defaultSet.id } },
		}),
	]);
	console.log(
		`Selesai: set '${defaultSet.nama}' (${defaultSet.id}), ${jumlahKriteria} rubric_criteria, ` +
			`${jumlahLevel} rubric_levels, ${jumlahBab} rubric_criterion_chapters, ` +
			`${jumlahDibackfill} writing_led_documents di-backfill ke set default.`,
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
