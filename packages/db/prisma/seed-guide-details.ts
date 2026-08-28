/**
 * Seed guide_references/guide_details/guide_detail_chapters dari
 * "Pedoman Penyusunan LEDPS – IAPS_AV_PJJ – 2025" (dokumen asli LAM Teknik),
 * hasil parse `apps/ai/scripts/parse_ledps_guide.py` -> guide-output.json.
 *
 * Tabel-tabel ini kosong sejak awal — GENERASI_BAB (worker.py::get_pedoman_for_bab)
 * karena itu selalu menerima pedoman=[]. Skrip sekali-jalan, sama pola dengan
 * seed-rubric-criteria.ts: hapus-tulis-ulang bertiga, bukan upsert selektif.
 *
 * Jalankan: npx ts-node prisma/seed-guide-details.ts
 * (guide-output.json harus sudah ada di folder ini — lihat parse_ledps_guide.py)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type GuidePoint = {
	chapter_order: number;
	point_code: string;
	point_title: string;
	content_text: string;
};

async function main() {
	const jsonPath = join(__dirname, 'guide-output.json');
	const points: GuidePoint[] = JSON.parse(readFileSync(jsonPath, 'utf-8'));
	if (points.length === 0) {
		throw new Error(`${jsonPath} kosong — jalankan parse_ledps_guide.py dulu.`);
	}
	console.log(`Sumber: ${points.length} poin dari ${jsonPath}`);

	await prisma.$transaction([
		prisma.guideDetailChapter.deleteMany({}),
		prisma.guideDetail.deleteMany({}),
		prisma.referenceGuide.deleteMany({}),
	]);

	const guide = await prisma.referenceGuide.create({
		data: {
			type: 'PANDUAN_LAM',
			title: 'Pedoman Penyusunan LEDPS – IAPS_AV_PJJ – 2025',
			fileUrl: 'pedoman-penyusunan-ledps-pjj-2025-4-november-2025.pdf',
			fileType: 'pdf',
		},
	});

	for (const p of points) {
		const detail = await prisma.guideDetail.create({
			data: {
				guideId: guide.id,
				pointCode: p.point_code,
				pointTitle: p.point_title,
				contentText: p.content_text,
			},
		});
		await prisma.guideDetailChapter.create({
			data: { guideDetailId: detail.id, chapterOrder: p.chapter_order },
		});
	}

	const [jumlahDetail, jumlahBab] = await Promise.all([
		prisma.guideDetail.count(),
		prisma.guideDetailChapter.count(),
	]);
	console.log(`Selesai: 1 guide_references, ${jumlahDetail} guide_details, ${jumlahBab} guide_detail_chapters.`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
