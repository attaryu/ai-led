import { ApiError } from '~/core/lib/api-client';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import {
	mapBuktiDukungRef,
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
