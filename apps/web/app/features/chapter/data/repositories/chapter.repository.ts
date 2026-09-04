import { ApiError } from '~/core/lib/api-client';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type ChapterSectionEntity } from '../../domain/entities/chapter-section.entity';
import { type DocumentRecommendationEntity } from '../../domain/entities/document-recommendation.entity';
import {
	mapBuktiDukungRef,
	mapChapterSection,
	mapDocumentRecommendation,
	mapHasilSkor,
	mapKontenBody,
	mapRagas,
	toKontenBody,
} from '../backend-mappers';
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
	const kontenKerja = mapKontenBody(row.workingContent);

	return {
		id: row.id,
		ledProjectId: row.documentId,
		urutanBab: row.chapterOrder,
		judulBab: row.chapterTitle,
		kontenKerja,
		checkpointAktifId: row.activeCheckpointId,
		terkunci: row.locked,
		catatanPenjaminMutu: row.qualityAssuranceNote,
		catatanOlehNama: row.notedByName,
		catatanPada: row.notedAt,
		diajukanReviewPada: row.reviewSubmittedAt,
		terakhirDisimpan: row.lastSavedAt,
		buktiDukung: mapBuktiDukungRef(row.buktiDukungBab),
		ragas: mapRagas(row.ragasScores?.[0]),
		hasilSkorKriteriaAktif: mapHasilSkor(row.hasilSkorKriteria),
	};
}

/**
 * Struktur bab LED Sarjana Terapan PJJ (LAM Teknik), dipakai sebagai cetakan
 * setiap kali Dokumen LED baru dibuat (docs/application_flow.md §7.3).
 *
 * Empat bab, bukan satu-bab-per-kriteria — cocok dengan template LED asli
 * (diekstrak dari contoh LED PJJ Teknik Telekomunikasi, lihat
 * `led_bab_tabel.json`): BAB I Pendahuluan, BAB II Struktur LED, BAB III
 * Program Pengembangan Berkelanjutan (memuat seluruh 64 indikator matriks
 * penilaian sebagai sub-bagian C.1–C.7 di dalam SATU bab, bukan bab
 * terpisah per kriteria), BAB IV Penutup.
 *
 * Sengaja satu level mengikuti `BAB_DOKUMEN.urutan_bab`; penjenjangan Daftar Isi
 * masih Pertanyaan Terbuka #2 (§16). Kalau daftar resminya ternyata berbeda,
 * cukup konstanta ini yang diubah — sisanya ikut.
 */
export const CHAPTER_TEMPLATE: { chapterOrder: number; chapterTitle: string }[] = [
	{ chapterOrder: 1, chapterTitle: 'Pendahuluan' },
	{ chapterOrder: 2, chapterTitle: 'Struktur Laporan Evaluasi Diri' },
	{ chapterOrder: 3, chapterTitle: 'Program Pengembangan Berkelanjutan' },
	{ chapterOrder: 4, chapterTitle: 'Penutup' },
];

export const chapterRepository = {
	/** Lintas prodi — Dashboard Utama KPI, `GET /bab`. */
	async findAll(): Promise<ChapterEntity[]> {
		const rows = await chapterRemoteSource.findAllForTenant();
		return rows.map(toEntityFromBackend);
	},

	/** Event yang sama dengan fitur lain supaya daftar yang terpasang ikut segar. */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	/**
	 * Bab satu dokumen, terurut `urutanBab` — dibaca dari `GET /dokumen/:id/bab`.
	 * Dipakai hanya oleh ringkasan progres (Dashboard Prodi/Project LED), bukan
	 * Editor Bab.
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
	 * selesai (tab Generasi).
	 *
	 * Tidak memanggil `notify()` — pemanggil (hook) yang memegang hasilnya
	 * lewat state React, mengikuti pola yang sama dengan `findByProjectId`.
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
				workingContent: toKontenBody(kontenKerja),
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
				workingContent: toKontenBody(kontenSnapshot),
			});
			return toEntityFromBackend(row);
		} catch (err) {
			if (err instanceof ApiError && err.status === 403) return undefined;
			throw err;
		}
	},

	/** Kunci review Penjamin Mutu (§12.2) — `PATCH bab/:id/review-status`. Error dilempar apa adanya, tombol klik sengaja. */
	async setTerkunci(chapterId: string, terkunci: boolean): Promise<ChapterEntity> {
		const row = await chapterRemoteSource.setReviewStatus(chapterId, { locked: terkunci });
		return toEntityFromBackend(row);
	},

	/** Catatan review PM, endpoint sama dengan `setTerkunci`. Catatan kosong -> `null`, bukan `""`. */
	async setCatatanPenjaminMutu(
		chapterId: string,
		catatan: string | null,
	): Promise<ChapterEntity> {
		const isi = catatan?.trim() ? catatan.trim() : null;
		const row = await chapterRemoteSource.setReviewStatus(chapterId, {
			qualityAssuranceNote: isi,
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

	/** Memicu REKOMENDASI_DOKUMEN — lihat `useChapterRecommendation`. */
	async triggerRecommendDocuments(chapterId: string, draftId?: string) {
		return chapterRemoteSource.recommendDocuments(chapterId, draftId);
	},

	/** `GET bab/:id/recommendation` — `null` bila belum ada rekomendasi untuk `draftId` (bila diisi) atau untuk bab ini (lihat sumbernya). */
	async findRecommendation(
		chapterId: string,
		draftId?: string,
	): Promise<DocumentRecommendationEntity | null> {
		const row = await chapterRemoteSource.findRecommendation(chapterId, draftId);
		return row ? mapDocumentRecommendation(row) : null;
	},

	/**
	 * Mengunci pilihan bukti dukung rekomendasi. Baris balikannya tidak
	 * menyertakan `items` (`bab-pipeline.service.ts::confirmRecommendation` tidak
	 * meng-`include`-nya) — pemanggil (`useChapterRecommendation`) menuliskan
	 * status/`selectedEvidenceIds` baru ke entity yang sudah dipegangnya sendiri
	 * alih-alih memetakan balikan yang tidak lengkap ini.
	 */
	async confirmRecommendation(
		chapterId: string,
		payload: { recommendationId: string; selectedEvidenceIds: string[] },
	): Promise<void> {
		await chapterRemoteSource.confirmRecommendation(chapterId, payload);
	},

	/** Memicu GENERASI_OUTLINE_BAB — lihat `useChapterSections`. */
	async triggerGenerateOutline(chapterId: string, overwrite?: boolean) {
		return chapterRemoteSource.generateOutline(chapterId, overwrite);
	},

	/** `GET bab/:id/sections`, terurut. */
	async findSections(chapterId: string): Promise<ChapterSectionEntity[]> {
		const rows = await chapterRemoteSource.findSections(chapterId);
		return rows.map(mapChapterSection).sort((a, b) => a.urutan - b.urutan);
	},

	/** Tambah section manual — lihat `useChapterSections`. `parentId` diisi → jadi sub-sub-bab section itu. */
	async createSection(
		chapterId: string,
		title: string,
		guidance: string,
		parentId?: string,
	): Promise<ChapterSectionEntity> {
		const row = await chapterRemoteSource.createSection(chapterId, { title, guidance, parentId });
		return mapChapterSection(row);
	},

	/** Ubah judul/panduan section manual. */
	async updateSection(
		chapterId: string,
		sectionId: string,
		payload: { title?: string; guidance?: string },
	): Promise<ChapterSectionEntity> {
		const row = await chapterRemoteSource.updateSection(chapterId, sectionId, payload);
		return mapChapterSection(row);
	},

	async deleteSection(chapterId: string, sectionId: string): Promise<void> {
		await chapterRemoteSource.deleteSection(chapterId, sectionId);
	},

	/**
	 * Autosave kanvas section-view (`use-chapter-autosave.ts`) — jalur
	 * BEDA dari `updateSection`: cuma nulis `content`, backend tidak
	 * mereset apa pun. `false` = section terkunci (bab-nya terkunci),
	 * sama seperti `updateKonten` bab.
	 */
	async updateSectionKonten(chapterId: string, sectionId: string, html: string): Promise<boolean> {
		try {
			await chapterRemoteSource.updateSection(chapterId, sectionId, { content: toKontenBody(html) });
			return true;
		} catch (err) {
			if (err instanceof ApiError && err.status === 403) return false;
			throw err;
		}
	},
};
