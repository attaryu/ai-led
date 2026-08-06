import { z } from 'zod';

import {
	chapterScoreSchema,
	type ChapterScoreEntity,
	type ChapterScoreTarget,
} from '../../domain/entities/chapter-score.entity';
import { chapterScoreLocalSource } from '../sources/local/chapter-score-local.source';

function daysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Hasil simulasi contoh.
 *
 * Sengaja hanya untuk **satu** checkpoint dan **tidak** untuk bab aktif mana pun:
 * keadaan "belum pernah disimulasikan" adalah yang paling sering ditemui pengguna
 * baru, jadi ia harus terlihat lebih dulu tanpa perlu menghapus data. Yang satu
 * ini ada supaya lingkup checkpoint yang sudah punya skor juga bisa dilihat
 * tanpa menjalankan simulasi lebih dulu.
 */
const initialScores: ChapterScoreEntity[] = [
	{
		id: 'skor-draft-1-1-3-rk-01',
		kriteriaId: 'rk-01',
		targetTipe: 'BAB_DRAFT',
		babId: null,
		babDraftId: 'draft-1-1-3',
		skorDidapat: 3,
		justifikasi:
			'Uraian sepanjang 412 kata sudah bertumpu pada berkas pendukung yang dirujuk bab ini, tapi belum ditutup dengan rencana tindak lanjut.',
		dijalankanOlehUserId: '1',
		dijalankanOlehNama: 'Ahmad Fauzi',
		dijalankanPada: daysAgo(1),
	},
	{
		id: 'skor-draft-1-1-3-rk-02',
		kriteriaId: 'rk-02',
		targetTipe: 'BAB_DRAFT',
		babId: null,
		babDraftId: 'draft-1-1-3',
		skorDidapat: 2,
		justifikasi:
			'Uraiannya sudah ada (412 kata) dan menyebut berkas pendukung, tapi isinya belum menjelaskan angka atau kondisi yang bisa ditelusuri.',
		dijalankanOlehUserId: '1',
		dijalankanOlehNama: 'Ahmad Fauzi',
		dijalankanPada: daysAgo(1),
	},
];

export const chapterScoreRepository = {
	/** Divalidasi saat dibaca, dengan alasan yang sama seperti `chapterRepository.findAll`. */
	findAll(): ChapterScoreEntity[] {
		const stored = chapterScoreLocalSource.getAll();
		if (!stored) {
			this.save(initialScores);
			return initialScores;
		}

		try {
			const parsed = z.array(chapterScoreSchema).safeParse(JSON.parse(stored));
			if (parsed.success) return parsed.data;
		} catch {
			// JSON-nya sendiri rusak; ditangani sama dengan bentuk yang tidak cocok.
		}

		this.save(initialScores);
		return initialScores;
	},

	save(scores: ChapterScoreEntity[]): void {
		chapterScoreLocalSource.setAll(JSON.stringify(scores));
	},

	/** Event yang sama dengan fitur lain supaya daftar yang terpasang ikut segar. */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	/**
	 * Hasil untuk satu target — bab aktif atau satu checkpoint.
	 *
	 * `targetTipe` ikut dicocokkan, bukan hanya idnya: id bab dan id checkpoint
	 * memang tidak pernah bertabrakan sekarang, tapi mengandalkan itu berarti
	 * menaruh kebenaran hasil penilaian pada kebetulan penamaan.
	 */
	findByTarget(
		targetTipe: ChapterScoreTarget,
		targetId: string,
	): ChapterScoreEntity[] {
		return this.findAll().filter((baris) =>
			targetTipe === 'BAB_AKTIF'
				? baris.targetTipe === 'BAB_AKTIF' && baris.babId === targetId
				: baris.targetTipe === 'BAB_DRAFT' && baris.babDraftId === targetId,
		);
	},

	/**
	 * Menyimpan hasil simulasi: baris lama untuk target ini **dibuang lalu
	 * diganti**, bukan ditambahkan.
	 *
	 * Inilah kebijakan "main timpa" yang docs/database.md §12 sebut untuk kedua
	 * jenis target — bab aktif maupun checkpoint. Menumpuknya sebagai riwayat
	 * berlapis akan membuat "berapa skor bab ini" punya lebih dari satu jawaban,
	 * dan tidak ada satu pun tempat di UI yang bisa memilih di antaranya.
	 */
	replaceForTarget(
		targetTipe: ChapterScoreTarget,
		targetId: string,
		hasil: Omit<
			ChapterScoreEntity,
			'id' | 'targetTipe' | 'babId' | 'babDraftId' | 'dijalankanPada'
		>[],
	): ChapterScoreEntity[] {
		const dijalankanPada = new Date().toISOString();
		const babId = targetTipe === 'BAB_AKTIF' ? targetId : null;
		const babDraftId = targetTipe === 'BAB_DRAFT' ? targetId : null;

		const baru: ChapterScoreEntity[] = hasil.map((baris) => ({
			...baris,
			id: `skor-${targetId}-${baris.kriteriaId}`,
			targetTipe,
			babId,
			babDraftId,
			dijalankanPada,
		}));

		const lain = this.findAll().filter((baris) =>
			targetTipe === 'BAB_AKTIF'
				? !(baris.targetTipe === 'BAB_AKTIF' && baris.babId === targetId)
				: !(baris.targetTipe === 'BAB_DRAFT' && baris.babDraftId === targetId),
		);

		this.save([...lain, ...baru]);
		this.notify();
		return baru;
	},

	/**
	 * Pembersihan berantai saat Dokumen LED dihapus — bukan pintu untuk menghapus
	 * satu hasil penilaian, yang memang tidak ada gunanya sendirian.
	 */
	deleteByTargets(babIds: string[], babDraftIds: string[]): void {
		const bab = new Set(babIds);
		const draft = new Set(babDraftIds);

		this.save(
			this.findAll().filter((baris) =>
				baris.targetTipe === 'BAB_AKTIF'
					? !bab.has(baris.babId ?? '')
					: !draft.has(baris.babDraftId ?? ''),
			),
		);
	},
};
