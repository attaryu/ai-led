import { z } from 'zod';

import { ApiError } from '~/core/lib/api-client';
import { type BuktiDukungRef } from '../../domain/entities/bukti-dukung-ref.entity';
import {
	chapterSchema,
	type ChapterEntity,
} from '../../domain/entities/chapter.entity';
import {
	mapBuktiDukungRef,
	mapHasilSkor,
	mapKontenBody,
	mapRagas,
	toKontenBody,
} from '../backend-mappers';
import { chapterLocalSource } from '../sources/local/chapter-local.source';
import {
	chapterRemoteSource,
	type BackendBabDokumen,
} from '../sources/remote/chapter.remote-source';

/**
 * `kontenKerja` backend adalah `Json` bebas bentuk (default `{}` saat bab
 * dibuat); frontend memakai string HTML. `{ format: 'html', body }` adalah
 * konvensi yang sudah diantisipasi komentar `ChapterEntity.kontenKerja` —
 * bentuk lain (termasuk `{}` kosong) dibaca sebagai "belum ada isi".
 *
 * `buktiDukung`/`ragas`/`hasilSkorKriteriaAktif` terisi dari relasi yang
 * di-`include` `bab-dokumen.service.ts::findOne` (`BuktiDukungBab`,
 * `RagasScore`, `HasilSkorKriteria`) — kosong pada hasil `findAllForDokumen`,
 * yang tidak meng-include-nya (dipakai ringkasan progres, bukan Editor Bab).
 */
function toEntityFromBackend(row: BackendBabDokumen): ChapterEntity {
	const kontenKerja = mapKontenBody(row.kontenKerja);

	return {
		id: row.id,
		ledProjectId: row.dokumenId,
		urutanBab: row.urutanBab,
		judulBab: row.judulBab,
		kontenKerja,
		checkpointAktifId: row.checkpointAktifId,
		terkunci: row.terkunci,
		catatanPenjaminMutu: row.catatanPenjaminMutu,
		catatanOlehNama: row.catatanOlehNama,
		catatanPada: row.catatanPada,
		diajukanReviewPada: row.diajukanReviewPada,
		terakhirDisimpan: row.terakhirDisimpan,
		buktiDukung: mapBuktiDukungRef(row.buktiDukungBab),
		ragas: mapRagas(row.ragasScores?.[0]),
		hasilSkorKriteriaAktif: mapHasilSkor(row.hasilSkorKriteria),
	};
}

/**
 * Struktur bab standar LED LAM-Teknik, dipakai sebagai cetakan setiap kali
 * Dokumen LED baru dibuat (docs/application_flow.md §7.3).
 *
 * Sengaja satu level mengikuti `BAB_DOKUMEN.urutan_bab`; penjenjangan Daftar Isi
 * masih Pertanyaan Terbuka #2 (§16). Kalau daftar resminya ternyata berbeda,
 * cukup konstanta ini yang diubah — sisanya ikut.
 */
export const CHAPTER_TEMPLATE: { urutanBab: number; judulBab: string }[] = [
	{ urutanBab: 1, judulBab: 'Pendahuluan' },
	{ urutanBab: 2, judulBab: 'Kondisi Eksternal' },
	{ urutanBab: 3, judulBab: 'Profil Unit Pengelola Program Studi' },
	{ urutanBab: 4, judulBab: 'Kriteria 1 — Visi, Misi, Tujuan, dan Strategi' },
	{
		urutanBab: 5,
		judulBab: 'Kriteria 2 — Tata Pamong, Tata Kelola, dan Kerja Sama',
	},
	{ urutanBab: 6, judulBab: 'Kriteria 3 — Mahasiswa' },
	{ urutanBab: 7, judulBab: 'Kriteria 4 — Sumber Daya Manusia' },
	{ urutanBab: 8, judulBab: 'Kriteria 5 — Keuangan, Sarana, dan Prasarana' },
	{ urutanBab: 9, judulBab: 'Kriteria 6 — Pendidikan' },
	{ urutanBab: 10, judulBab: 'Kriteria 7 — Penelitian' },
	{ urutanBab: 11, judulBab: 'Kriteria 8 — Pengabdian kepada Masyarakat' },
	{ urutanBab: 12, judulBab: 'Kriteria 9 — Luaran dan Capaian Tridharma' },
	{
		urutanBab: 13,
		judulBab: 'Analisis dan Penetapan Program Pengembangan',
	},
	{ urutanBab: 14, judulBab: 'Penutup' },
];

function buildEmptyChapters(ledProjectId: string): ChapterEntity[] {
	return CHAPTER_TEMPLATE.map((bab) => ({
		id: `bab-${ledProjectId}-${bab.urutanBab}`,
		ledProjectId,
		urutanBab: bab.urutanBab,
		judulBab: bab.judulBab,
		kontenKerja: null,
		checkpointAktifId: null,
		terkunci: false,
		catatanPenjaminMutu: null,
		catatanOlehNama: null,
		catatanPada: null,
		diajukanReviewPada: null,
		terakhirDisimpan: null,
		buktiDukung: [],
		// Bab kosong belum pernah digenerate, jadi belum ada mutu jawaban AI yang
		// bisa dinilai. Sama untuk bab contoh yang isinya ditulis tangan di seed.
		ragas: null,
		hasilSkorKriteriaAktif: [],
	}));
}

/**
 * Cuplikan seed `evidence.repository.ts`, hanya berkas yang dipakai seed bab di
 * bawah.
 *
 * Ditulis ulang di sini alih-alih mengimpor repository bukti dukung: seed ini
 * berjalan saat modul dimuat, dan menyeret repository fitur lain ke dalam jalur
 * itu membuat urutan inisialisasi keduanya saling bergantung. Kalau nama berkas
 * di sana berubah, yang di sini ikut disesuaikan — tapi itu data contoh yang
 * memang jarang bergerak.
 */
const BUKTI: Record<string, BuktiDukungRef> = {
	'ev-01': {
		id: 'ev-01',
		namaDokumen: 'Statuta_Universitas_2024.pdf',
		tipeFile: 'pdf',
	},
	'ev-02': {
		id: 'ev-02',
		namaDokumen: 'Renstra_Universitas_2025_2030.pdf',
		tipeFile: 'pdf',
	},
	'ev-04': {
		id: 'ev-04',
		namaDokumen: 'Pedoman_Akademik_Universitas.docx',
		tipeFile: 'docx',
	},
	'ev-12': {
		id: 'ev-12',
		namaDokumen: 'LKPS_Teknik_Informatika_2026.xlsx',
		tipeFile: 'xlsx',
	},
	'ev-13': {
		id: 'ev-13',
		namaDokumen: 'SK_Kurikulum_Prodi_TI.pdf',
		tipeFile: 'pdf',
	},
	'ev-14': {
		id: 'ev-14',
		namaDokumen: 'Daftar_Publikasi_Dosen_TI.xlsx',
		tipeFile: 'xlsx',
	},
	'ev-16': {
		id: 'ev-16',
		namaDokumen: 'LKPS_Sistem_Informasi_2026.xlsx',
		tipeFile: 'xlsx',
	},
	'ev-17': {
		id: 'ev-17',
		namaDokumen: 'Laporan_Kegiatan_Himpunan_SI.docx',
		tipeFile: 'docx',
	},
	'ev-18': {
		id: 'ev-18',
		namaDokumen: 'SK_Dosen_Pembimbing_TA_Elektro.pdf',
		tipeFile: 'pdf',
	},
};

function daysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function contohKonten(judulBab: string): string {
	return `Narasi ${judulBab} untuk keperluan pratinjau antarmuka.`;
}

/**
 * Kondisi awal tiap dokumen contoh, dibuat berbeda-beda supaya dashboard punya
 * sesuatu yang layak dilihat: dokumen 1 baru berjalan, dokumen 2 sedang direview
 * sebagian, dokumen 3 dan 4 sudah tuntas.
 */
const SEED_STATE: Record<
	string,
	{
		babTerisi: number;
		babTerkunci: number;
		/** `urutanBab` yang sedang diantrekan Penyusun untuk direview (§12.2). */
		diajukan?: number[];
		catatan?: Record<number, string>;
		terbengkalai?: number[];
		buktiDukung?: Record<number, BuktiDukungRef[]>;
	}
> = {
	'1': {
		babTerisi: 5,
		babTerkunci: 0,
		// Satu bab sudah diantrekan supaya keadaan ini terlihat di dashboard tanpa
		// perlu mengklik apa pun lebih dulu.
		diajukan: [4],
		catatan: {
			3: 'Profil UPPS masih memakai data tahun lalu, mohon diperbarui.',
		},
		terbengkalai: [2],
		buktiDukung: {
			1: [BUKTI['ev-01'], BUKTI['ev-02']],
			2: [BUKTI['ev-02']],
			4: [BUKTI['ev-01'], BUKTI['ev-12']],
			5: [BUKTI['ev-13'], BUKTI['ev-14']],
		},
	},
	'2': {
		babTerisi: 12,
		babTerkunci: 4,
		buktiDukung: {
			1: [BUKTI['ev-01']],
			3: [BUKTI['ev-16']],
			4: [BUKTI['ev-01'], BUKTI['ev-02']],
			6: [BUKTI['ev-17']],
			9: [BUKTI['ev-04']],
			12: [BUKTI['ev-16'], BUKTI['ev-17']],
		},
	},
	'3': {
		babTerisi: CHAPTER_TEMPLATE.length,
		babTerkunci: CHAPTER_TEMPLATE.length,
		buktiDukung: {
			1: [BUKTI['ev-01'], BUKTI['ev-02']],
			5: [BUKTI['ev-18']],
			10: [BUKTI['ev-18'], BUKTI['ev-04']],
		},
	},
	// Penyusunan lama Teknik Informatika, sudah tuntas — isi arsip Dashboard Prodi.
	'4': {
		babTerisi: CHAPTER_TEMPLATE.length,
		babTerkunci: CHAPTER_TEMPLATE.length,
		buktiDukung: {
			1: [BUKTI['ev-01']],
			3: [BUKTI['ev-13']],
		},
	},
};

function buildSeededChapters(ledProjectId: string): ChapterEntity[] {
	const state = SEED_STATE[ledProjectId];
	const chapters = buildEmptyChapters(ledProjectId);
	if (!state) return chapters;

	return chapters.map((chapter) => {
		const terisi = chapter.urutanBab <= state.babTerisi;
		const terbengkalai = state.terbengkalai?.includes(chapter.urutanBab) ?? false;
		const catatan = state.catatan?.[chapter.urutanBab] ?? null;

		return {
			...chapter,
			kontenKerja: terisi ? contohKonten(chapter.judulBab) : null,
			terkunci: chapter.urutanBab <= state.babTerkunci,
			catatanPenjaminMutu: catatan,
			// Nama Penjamin Mutu di `session.repository.ts`, supaya atribusi di tab
			// Review menyebut orang yang memang ada di daftar user contoh.
			catatanOlehNama: catatan ? 'Ahmad Fauzi' : null,
			catatanPada: catatan ? daysAgo(1) : null,
			diajukanReviewPada: state.diajukan?.includes(chapter.urutanBab)
				? daysAgo(0.1)
				: null,
			terakhirDisimpan: terisi
				? terbengkalai
					? daysAgo(31)
					: daysAgo(chapter.urutanBab * 0.35)
				: null,
			buktiDukung: state.buktiDukung?.[chapter.urutanBab] ?? [],
		};
	});
}

const initialChapters: ChapterEntity[] = Object.keys(SEED_STATE).flatMap(
	buildSeededChapters,
);

export const chapterRepository = {
	/**
	 * Isi yang tersimpan **divalidasi**, bukan sekadar di-`JSON.parse` lalu
	 * dianggap `ChapterEntity[]`.
	 *
	 * Bukan kehati-hatian berlebih: bentuk barisnya sudah pernah berubah sekali
	 * (`buktiDukungIds: string[]` jadi `buktiDukung: BuktiDukungRef[]`), dan data
	 * bentuk lama **lolos `JSON.parse` tanpa melempar apa pun**. Yang terjadi
	 * kemudian bukan pesan galat yang jelas, melainkan `chapter.buktiDukung is not
	 * iterable` di kedalaman `summarizeChapters` — jauh dari penyebabnya, dan
	 * cukup untuk menjatuhkan seluruh halaman Dashboard.
	 *
	 * Menaikkan nomor key penyimpanan saja tidak cukup: itu hanya menolong halaman
	 * yang dimuat ulang seutuhnya, sedangkan pemuatan ulang sebagian — modul
	 * sumber lokal masih versi lama sementara entitasnya sudah baru — tetap
	 * membaca bentuk lama. Pemeriksaan di sini berlaku untuk semuanya, dan
	 * sekaligus membuat perubahan bentuk berikutnya tidak perlu mengarang nama key
	 * lagi.
	 */
	findAll(): ChapterEntity[] {
		const stored = chapterLocalSource.getAll();
		if (!stored) {
			this.save(initialChapters);
			return initialChapters;
		}

		try {
			const parsed = z.array(chapterSchema).safeParse(JSON.parse(stored));
			if (parsed.success) return parsed.data;
		} catch {
			// JSON-nya sendiri rusak; ditangani sama dengan bentuk yang tidak cocok.
		}

		this.save(initialChapters);
		return initialChapters;
	},

	save(chapters: ChapterEntity[]): void {
		chapterLocalSource.setAll(JSON.stringify(chapters));
	},

	/** Event yang sama dengan fitur lain supaya daftar yang terpasang ikut segar. */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	/**
	 * Bab satu dokumen, terurut `urutanBab` — dibaca dari `GET /dokumen/:id/bab`.
	 * Dipakai hanya oleh ringkasan progres (Dashboard Prodi/Project LED), bukan
	 * Editor Bab: itulah kenapa cuma metode ini (dan bukan `findById` di bawah,
	 * yang murni dipakai alur checkpoint/generate editor) yang beralih ke HTTP —
	 * lihat catatan migrasi tracker untuk alasan lengkapnya.
	 *
	 * Backend tidak lagi memateraikan bab otomatis untuk dokumen kosong — itu
	 * tanggung jawab `ledProjectRepository.create()` sekarang — jadi array
	 * kosong di sini memang berarti dokumennya belum punya bab, bukan sinyal
	 * untuk membuatkannya.
	 */
	async findByProjectId(ledProjectId: string): Promise<ChapterEntity[]> {
		const rows = await chapterRemoteSource.findAllForDokumen(ledProjectId);
		return rows.map(toEntityFromBackend).sort((a, b) => a.urutanBab - b.urutanBab);
	},

	/**
	 * Bab satu-satunya, dibaca ulang dari backend — dipakai sesudah GENERASI_BAB
	 * selesai (tab Generasi). Beda dari {@link findById}: itu baca `localStorage`
	 * (data contoh), ini baca sumber sesungguhnya, jadi `chapter.id` di sini
	 * **harus** id `BabDokumen` sungguhan, bukan id contoh lokal.
	 *
	 * Tidak menulis ke `localStorage` maupun memanggil `notify()` — pemanggil
	 * (hook) yang memegang hasilnya lewat state React, mengikuti pola yang sama
	 * dengan `findByProjectId`.
	 */
	async refreshFromBackend(id: string): Promise<ChapterEntity> {
		const row = await chapterRemoteSource.findOne(id);
		return toEntityFromBackend(row);
	},

	/**
	 * Autosave: `PATCH bab/:id` (§7.2). 403 (terkunci/diajukan review) dibalas
	 * `undefined`, sama seperti versi localStorage dulu. Error lain dilempar
	 * ulang — `useChapterAutosave` yang mencoba lagi.
	 */
	async updateKonten(
		chapterId: string,
		kontenKerja: string,
	): Promise<ChapterEntity | undefined> {
		try {
			const row = await chapterRemoteSource.update(chapterId, {
				kontenKerja: toKontenBody(kontenKerja),
			});
			return toEntityFromBackend(row);
		} catch (err) {
			if (err instanceof ApiError && err.status === 403) return undefined;
			throw err;
		}
	},

	/**
	 * Restore checkpoint (§8.1) lewat `PATCH bab/:id`, sama seperti autosave.
	 *
	 * ponytail: hanya `kontenKerja` ditulis balik — DTO backend belum bisa
	 * restore `checkpointAktifId`/`buktiDukung`/`ragas`. Tab Rujukan/Kualitas AI
	 * jadi tetap pakai punya kondisi aktif lama. Upgrade: endpoint restore khusus.
	 */
	async restoreFromDraft(
		chapterId: string,
		kontenSnapshot: string,
	): Promise<ChapterEntity | undefined> {
		try {
			const row = await chapterRemoteSource.update(chapterId, {
				kontenKerja: toKontenBody(kontenSnapshot),
			});
			return toEntityFromBackend(row);
		} catch (err) {
			if (err instanceof ApiError && err.status === 403) return undefined;
			throw err;
		}
	},

	/** Kunci review Penjamin Mutu (§12.2) — `PATCH bab/:id/review-status`. Error dilempar apa adanya, tombol klik sengaja. */
	async setTerkunci(chapterId: string, terkunci: boolean): Promise<ChapterEntity> {
		const row = await chapterRemoteSource.setReviewStatus(chapterId, { terkunci });
		return toEntityFromBackend(row);
	},

	/** Catatan review PM, endpoint sama dengan `setTerkunci`. Catatan kosong -> `null`, bukan `""`. */
	async setCatatanPenjaminMutu(
		chapterId: string,
		catatan: string | null,
	): Promise<ChapterEntity> {
		const isi = catatan?.trim() ? catatan.trim() : null;
		const row = await chapterRemoteSource.setReviewStatus(chapterId, {
			catatanPenjaminMutu: isi,
		});
		return toEntityFromBackend(row);
	},

	/** Ajukan/batalkan review Penyusun — `POST bab/:id/submit-review`, `diajukan: false` untuk batal. */
	async setDiajukanReview(
		chapterId: string,
		diajukan: boolean,
	): Promise<ChapterEntity> {
		const row = await chapterRemoteSource.submitForReview(chapterId, diajukan);
		return toEntityFromBackend(row);
	},
};
