import { z } from 'zod';

import { chapterRepository } from '~/features/chapter/data/repositories/chapter.repository';
import { hasKonten } from '~/features/chapter/domain/entities/chapter.entity';
import {
	findAllKriteria,
	skorMaksimal,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { type StartAssessmentDto } from '../../domain/dtos/start-assessment.dto';
import { type AssessmentQuality } from '../../domain/entities/assessment-quality.entity';
import {
	assessmentSessionSchema,
	type AssessmentSessionEntity,
} from '../../domain/entities/assessment-session.entity';
import {
	indicatorResultSchema,
	type IndicatorResultEntity,
} from '../../domain/entities/indicator-result.entity';
import { type AssessmentSource } from '../../domain/entities/assessment-source.entity';
import { assessmentLocalSource } from '../sources/local/assessment-local.source';
import {
	kontenTiruanDariBerkas,
	nilaiIndikator,
	type RunIndicatorResult,
} from '../sources/remote/assessment-run.mock';

/**
 * Sesi penilaian AMI beserta hasil mesinnya (docs/database.md →
 * `AssessmentSession`, `IndicatorResult`).
 *
 * Koreksi Penjamin Mutu **tidak** ada di sini — ia punya repository sendiri
 * karena umurnya berbeda: yang di berkas ini ditimpa tiap penilaian ulang,
 * yang di sana harus bertahan melewatinya.
 */

function daysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Satu sesi contoh untuk dokumen `2` — dokumen yang di seed bab-nya sudah terisi
 * sebagian dan sebagian sudah dikunci, jadi dokumen itulah yang paling masuk akal
 * sudah pernah dinilai.
 *
 * Ada supaya tab Riwayat, tab Kualitas Penilaian, dan penanda koreksi punya
 * sesuatu untuk ditampilkan tanpa harus menjalankan penilaian lebih dulu.
 *
 * **Dibangun malas, bukan sebagai konstanta modul, dan itu bukan soal
 * performa.** Skornya harus dihitung dari isi bab dokumen itu yang sebenarnya —
 * dengan mesin yang sama seperti penilaian sungguhan. Versi pertama berkas ini
 * memakai untaian sintetis karena membaca `chapterRepository` saat modul dimuat
 * akan membuat urutan inisialisasi kedua repository saling bergantung (alasan
 * yang sama sudah ditulis di `chapter.repository.ts`). Akibatnya terlihat begitu
 * dijalankan: menekan "Nilai Ulang" tanpa menyunting apa pun melompatkan
 * rata-rata dari 2,61 ke 3,61, dan seluruh koreksi mendadak ditandai basi.
 * Keduanya perilaku yang benar — skor mesinnya memang berubah — tapi yang
 * berubah adalah sesuatu yang tidak pernah dilihat pengguna, sehingga fiturnya
 * terbaca seperti rusak.
 *
 * Membangunnya saat penyimpanan pertama kali dibaca menyelesaikan keduanya: yang
 * dipanggil saat itu adalah kode yang sedang berjalan, bukan modul yang sedang
 * dimuat.
 */
const SEED_DOKUMEN_ID = '2';
const SEED_SESI_ID = 'ami-seed-1';

const SEED_SUMBER: AssessmentSource = {
	sumberLed: 'EDITOR',
	ledFileName: null,
	lkpsBuktiDukungId: 'ev-16',
	laporanBuktiDukungId: null,
};

function buildSeedSessions(): AssessmentSessionEntity[] {
	const total = findAllKriteria().length;

	return [
		{
			id: SEED_SESI_ID,
			dokumenId: SEED_DOKUMEN_ID,
			sumber: SEED_SUMBER,
			totalIndicators: total,
			completedIndicators: total,
			status: 'COMPLETED',
			error: null,
			dijalankanOlehUserId: '3',
			dijalankanOlehNama: 'Ahmad Fauzi',
			createdAt: daysAgo(3),
			updatedAt: daysAgo(3),
			kualitas: null,
		},
	];
}

function buildSeedResults(): IndicatorResultEntity[] {
	// Seed tidak memuat bab dokumen sungguhan lewat API — ia hanya demo statis,
	// jadi isi tiruannya cukup dari mock berkas yang sama seperti sumber UNGGAHAN.
	const konten = kontenTiruanDariBerkas(SEED_SUMBER.ledFileName ?? SEED_DOKUMEN_ID);

	// Penilai yang sama persis dengan yang dipakai penilaian sungguhan — termasuk
	// keyakinan dan rekomendasinya. Kalau seed menghitungnya sendiri, menekan
	// "Nilai Ulang" tanpa menyunting apa pun akan menggeser angka-angka di layar,
	// dan fiturnya terbaca seperti rusak padahal tidak ada yang berubah.
	return findAllKriteria().map((kriteria) => {
		const dinilai = nilaiIndikator(konten, {
			no: kriteria.no,
			kodeKriteria: kriteria.kodeKriteria,
			skorMaksimal: skorMaksimal(kriteria),
			tipeSkor: kriteria.tipeSkor,
		});

		return {
			id: `ir-${SEED_SESI_ID}-${kriteria.no}`,
			sesiId: SEED_SESI_ID,
			...dinilai,
			dinilaiPada: daysAgo(3),
		};
	});
}

export const assessmentSessionRepository = {
	/**
	 * Isi tersimpan **divalidasi**, bukan sekadar di-`JSON.parse`.
	 *
	 * Alasannya sama persis dengan yang sudah ditulis panjang di
	 * `chapter.repository.ts`: bentuk baris bisa berubah, dan bentuk lama lolos
	 * `JSON.parse` tanpa melempar apa pun — yang muncul kemudian bukan pesan galat
	 * yang jelas melainkan kegagalan di kedalaman fungsi peringkas, jauh dari
	 * penyebabnya.
	 */
	findAll(): AssessmentSessionEntity[] {
		const stored = assessmentLocalSource.getSessions();
		if (stored) {
			try {
				const parsed = z
					.array(assessmentSessionSchema)
					.safeParse(JSON.parse(stored));
				if (parsed.success) return parsed.data;
			} catch {
				// JSON-nya sendiri rusak; ditangani sama dengan bentuk yang tidak cocok.
			}
		}

		const seed = buildSeedSessions();
		this.saveSessions(seed);
		return seed;
	},

	findAllResults(): IndicatorResultEntity[] {
		const stored = assessmentLocalSource.getResults();
		if (stored) {
			try {
				const parsed = z
					.array(indicatorResultSchema)
					.safeParse(JSON.parse(stored));
				if (parsed.success) return parsed.data;
			} catch {
				// Sama seperti di atas.
			}
		}

		const seed = buildSeedResults();
		this.saveResults(seed);
		return seed;
	},

	/**
	 * Tulisan LED yang dinilai.
	 *
	 * Ditaruh di repository, bukan di hook, karena dua pemanggil membutuhkannya
	 * dan salah satunya bukan komponen: seed di berkas ini menilai isi yang sama
	 * dengan yang akan dinilai penilaian sungguhan. Dua perakit terpisah akan
	 * memberi dua untaian berbeda untuk dokumen yang sama, dan setiap koreksi
	 * akan tampak basi tanpa ada yang menyentuh dokumennya.
	 *
	 * Bab digabung **beserta judulnya** dan terurut: yang asli mengindeks LED per
	 * bagian lalu mencari potongan yang relevan per indikator, dan judul bab
	 * adalah satu-satunya penanda bagian yang dipunya dokumen ini. Bab kosong
	 * dilewati supaya panjang tulisan mencerminkan yang benar-benar ditulis.
	 */
	async rakitKonten(
		projectId: string,
		sumber: AssessmentSource,
	): Promise<string> {
		if (sumber.sumberLed === 'UNGGAHAN') {
			return sumber.ledFileName
				? kontenTiruanDariBerkas(sumber.ledFileName)
				: '';
		}

		const bab = await chapterRepository.findByProjectId(projectId);
		return bab
			.filter(hasKonten)
			.map((b) => `${b.judulBab}\n${b.kontenKerja ?? ''}`)
			.join('\n\n');
	},

	saveSessions(sessions: AssessmentSessionEntity[]): void {
		assessmentLocalSource.setSessions(JSON.stringify(sessions));
	},

	saveResults(results: IndicatorResultEntity[]): void {
		assessmentLocalSource.setResults(JSON.stringify(results));
	},

	/** Event yang sama dengan fitur lain supaya daftar yang terpasang ikut segar. */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	/** Sesi satu dokumen, terbaru di atas. */
	findByDokumenId(dokumenId: string): AssessmentSessionEntity[] {
		return this.findAll()
			.filter((sesi) => sesi.dokumenId === dokumenId)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	},

	findById(sesiId: string): AssessmentSessionEntity | undefined {
		return this.findAll().find((sesi) => sesi.id === sesiId);
	},

	/** Sesi terakhir dokumen ini; `undefined` bila belum pernah dinilai. */
	findLatest(dokumenId: string): AssessmentSessionEntity | undefined {
		return this.findByDokumenId(dokumenId)[0];
	},

	findResultsBySession(sesiId: string): IndicatorResultEntity[] {
		return this.findAllResults().filter((baris) => baris.sesiId === sesiId);
	},

	/**
	 * Membuat sesi baru berstatus `RUNNING`.
	 *
	 * `totalIndicators` dibaca dari master matriks di sini, bukan diminta dari
	 * pemanggil: jumlah indikator adalah fakta tentang rubrik, dan membiarkan
	 * halaman menyetorkannya membuka peluang sesi mengaku menilai 78 indikator
	 * padahal matriksnya cuma punya 18.
	 */
	create(dto: StartAssessmentDto): AssessmentSessionEntity {
		const sekarang = new Date().toISOString();
		const sesi: AssessmentSessionEntity = {
			id: `ami-${Date.now()}`,
			dokumenId: dto.dokumenId,
			sumber: dto.sumber,
			totalIndicators: findAllKriteria().length,
			completedIndicators: 0,
			status: 'RUNNING',
			error: null,
			dijalankanOlehUserId: dto.dijalankanOlehUserId,
			dijalankanOlehNama: dto.dijalankanOlehNama,
			createdAt: sekarang,
			updatedAt: sekarang,
			kualitas: null,
		};

		this.saveSessions([sesi, ...this.findAll()]);
		this.notify();
		return sesi;
	},

	/** Menambah satu hasil indikator sekaligus memajukan progres sesinya. */
	appendResult(sesiId: string, hasil: RunIndicatorResult): void {
		const semua = this.findAllResults();
		const baris: IndicatorResultEntity = {
			id: `ir-${sesiId}-${hasil.indikatorNo}`,
			sesiId,
			indikatorNo: hasil.indikatorNo,
			skor: hasil.skor,
			justifikasi: hasil.justifikasi,
			confidence: hasil.confidence,
			rekomendasi: hasil.rekomendasi,
			error: hasil.error,
			dinilaiPada: new Date().toISOString(),
		};

		// Main timpa per (sesi, indikator): menjalankan ulang sesi yang sama tidak
		// boleh menumpuk dua baris untuk indikator yang sama.
		this.saveResults([
			...semua.filter(
				(item) =>
					!(item.sesiId === sesiId && item.indikatorNo === hasil.indikatorNo),
			),
			baris,
		]);

		this.patch(sesiId, (sesi) => ({
			completedIndicators: Math.min(
				sesi.totalIndicators,
				sesi.completedIndicators + 1,
			),
		}));
	},

	finish(sesiId: string): void {
		this.patch(sesiId, () => ({ status: 'COMPLETED', error: null }));
	},

	fail(sesiId: string, pesan: string): void {
		this.patch(sesiId, () => ({ status: 'FAILED', error: pesan }));
	},

	setKualitas(sesiId: string, kualitas: AssessmentQuality): void {
		this.patch(sesiId, () => ({ kualitas }));
	},

	/**
	 * Satu jalur tulis untuk seluruh perubahan sesi, supaya `updatedAt` tidak bisa
	 * terlewat di salah satu pemanggil.
	 */
	patch(
		sesiId: string,
		ubah: (
			sesi: AssessmentSessionEntity,
		) => Partial<AssessmentSessionEntity>,
	): AssessmentSessionEntity | undefined {
		const semua = this.findAll();
		const target = semua.find((sesi) => sesi.id === sesiId);
		if (!target) return undefined;

		const updated: AssessmentSessionEntity = {
			...target,
			...ubah(target),
			updatedAt: new Date().toISOString(),
		};

		this.saveSessions(
			semua.map((sesi) => (sesi.id === sesiId ? updated : sesi)),
		);
		this.notify();
		return updated;
	},

	/**
	 * Dipanggil saat Dokumen LED dihapus supaya sesinya tidak jadi sampah.
	 *
	 * Koreksi Penjamin Mutu dibersihkan terpisah lewat repository-nya sendiri —
	 * ia menempel ke dokumen, bukan ke sesi, jadi ia tidak ikut terbawa
	 * penyaringan di sini.
	 */
	deleteByDokumenId(dokumenId: string): void {
		const semua = this.findAll();
		const dibuang = new Set(
			semua
				.filter((sesi) => sesi.dokumenId === dokumenId)
				.map((sesi) => sesi.id),
		);
		if (dibuang.size === 0) return;

		this.saveResults(
			this.findAllResults().filter((baris) => !dibuang.has(baris.sesiId)),
		);
		this.saveSessions(semua.filter((sesi) => sesi.dokumenId !== dokumenId));
	},
};
