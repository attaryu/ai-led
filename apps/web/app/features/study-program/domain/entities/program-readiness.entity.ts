import {
	pickRecentChapterSaves,
	type ChapterAttention,
	type ChapterEntity,
} from '~/features/chapter/domain/entities/chapter.entity';
import { type EvidenceSummary } from '~/features/evidence/domain/entities/evidence.entity';
import {
	deriveDeadline,
	type LedProjectEntity,
} from '~/features/led-project/domain/entities/led-project.entity';
import { deriveAccreditationValidity } from './study-program.entity';

/**
 * Aturan turunan Dashboard Prodi (docs/application_flow.md §5.1).
 *
 * Ditaruh di domain, bukan di komponen, mengikuti jejak `summarizeChapters`:
 * dashboard agregat institusi nanti perlu tahu prodi mana yang tersendat, dan
 * jawabannya harus datang dari aturan yang sama — bukan dari salinan yang
 * perlahan menyimpang.
 */

export const PROGRAM_ATTENTION_SEVERITIES = ['MENDESAK', 'PERLU_DITINDAK'] as const;
export type ProgramAttentionSeverity =
	(typeof PROGRAM_ATTENTION_SEVERITIES)[number];

export type ProgramAttentionItem = {
	id: string;
	judul: string;
	alasan: string;
	severitas: ProgramAttentionSeverity;
};

export type ProgramActivityKind = 'BAB' | 'DOKUMEN';

export type ProgramActivity = {
	kind: ProgramActivityKind;
	/** ISO. */
	waktu: string;
	judul: string;
	keterangan: string;
};

/** Berapa banyak baris yang muat di panel sebelum sisanya diringkas. */
export const MAX_PROGRAM_ATTENTION_SHOWN = 5;

/** Berapa banyak jejak aktivitas yang ditampilkan. */
export const MAX_PROGRAM_ACTIVITY_SHOWN = 4;

/**
 * Hal-hal yang menghambat kesiapan akreditasi prodi ini, terurut dari yang
 * paling mendesak.
 *
 * Urutannya sengaja menaruh tenggat dan masa berlaku di atas kondisi bab: bab
 * kosong adalah keadaan normal bagi dokumen yang baru berjalan, sedangkan
 * tanggal yang sudah lewat tidak pernah normal. Bab-bab itu sendiri sudah
 * punya rumah yang lebih rinci di Dashboard Project LED (§6.1), jadi di sini ia
 * hanya perlu muncul secukupnya sebagai penunjuk arah.
 */
export function buildProgramAttention({
	berlakuSampaiAkreditasi,
	siklusAktif,
	chapterAttention,
	evidenceProdi,
	jumlahPenyusun,
	now = Date.now(),
}: {
	berlakuSampaiAkreditasi: string | null;
	siklusAktif: LedProjectEntity | null;
	chapterAttention: ChapterAttention[];
	/**
	 * Ringkasan bukti dukung **milik prodi**, bukan seluruh yang tersedia:
	 * kegagalan ekstraksi berkas universitas bukan pekerjaan prodi ini dan
	 * muncul di tempatnya sendiri (§4.4).
	 */
	evidenceProdi: EvidenceSummary;
	jumlahPenyusun: number;
	now?: number;
}): ProgramAttentionItem[] {
	const mendesak: ProgramAttentionItem[] = [];
	const perluDitindak: ProgramAttentionItem[] = [];

	const tenggat = siklusAktif
		? deriveDeadline(siklusAktif.tenggat, now)
		: null;
	const akreditasi = deriveAccreditationValidity(berlakuSampaiAkreditasi, now);

	if (tenggat?.urgensi === 'LEWAT') {
		mendesak.push({
			id: 'tenggat-lewat',
			judul: 'Tenggat dokumen sudah lewat',
			alasan: `Terlambat ${-tenggat.sisaHari} hari dari target penyelesaian.`,
			severitas: 'MENDESAK',
		});
	}

	if (akreditasi?.urgensi === 'KEDALUWARSA') {
		mendesak.push({
			id: 'akreditasi-kedaluwarsa',
			judul: 'Masa berlaku akreditasi habis',
			alasan: `Berakhir ${-akreditasi.sisaHari} hari lalu.`,
			severitas: 'MENDESAK',
		});
	}

	// Prodi tanpa dokumen memang wajar bila akreditasinya masih lama; ia baru
	// jadi masalah ketika siklus berikutnya seharusnya sudah berjalan.
	if (!siklusAktif && akreditasi && akreditasi.urgensi !== 'AMAN') {
		mendesak.push({
			id: 'tanpa-siklus',
			judul: 'Belum ada Dokumen LED yang berjalan',
			alasan:
				akreditasi.urgensi === 'KEDALUWARSA'
					? 'Akreditasi sudah kedaluwarsa dan belum ada dokumen baru.'
					: `Masa berlaku akreditasi tinggal ${akreditasi.sisaHari} hari.`,
			severitas: 'MENDESAK',
		});
	}

	if (jumlahPenyusun === 0) {
		perluDitindak.push({
			id: 'tanpa-penyusun',
			judul: 'Prodi belum punya Penyusun',
			alasan: 'Belum ada user yang ditugaskan menulis dokumen prodi ini.',
			severitas: 'PERLU_DITINDAK',
		});
	}

	if (tenggat?.urgensi === 'DEKAT') {
		perluDitindak.push({
			id: 'tenggat-dekat',
			judul: 'Tenggat dokumen sudah dekat',
			alasan: `Tersisa ${tenggat.sisaHari} hari menuju target penyelesaian.`,
			severitas: 'PERLU_DITINDAK',
		});
	}

	if (akreditasi?.urgensi === 'MENDEKATI') {
		perluDitindak.push({
			id: 'akreditasi-mendekati',
			judul: 'Akreditasi mendekati masa akhir',
			alasan: `Berlaku ${akreditasi.sisaHari} hari lagi.`,
			severitas: 'PERLU_DITINDAK',
		});
	}

	// Diringkas jadi satu baris: yang perlu diketahui di sini cuma "ada yang
	// gagal", rinciannya ada di Perpustakaan Bukti Dukung.
	if (evidenceProdi.gagal > 0) {
		perluDitindak.push({
			id: 'bukti-dukung-gagal',
			judul: `${evidenceProdi.gagal} bukti dukung gagal diproses`,
			alasan: 'Isinya belum bisa dipakai sebagai konteks AI sampai berhasil.',
			severitas: 'PERLU_DITINDAK',
		});
	}

	const bab: ProgramAttentionItem[] = chapterAttention.map(
		({ chapter, alasan }) => ({
			id: `bab-${chapter.id}`,
			judul: `Bab ${chapter.urutanBab}. ${chapter.judulBab}`,
			alasan,
			severitas: 'PERLU_DITINDAK',
		}),
	);

	return [...mendesak, ...perluDitindak, ...bab];
}

/**
 * Jejak "siklus ini masih bergerak atau mandek": bab-bab yang terakhir disimpan,
 * ditutup penanda kapan siklusnya dimulai. Terbaru di atas.
 *
 * Cakupannya sengaja **hanya siklus berjalan**. Waktu unggah bukti dukung
 * dulunya ikut di sini, tapi bukti dukung tidak terikat ke satu Dokumen LED
 * (§5.2) sehingga entri lintas siklus itu membuat daftar ini seolah bicara
 * tentang pekerjaan sekarang padahal tidak — jejaknya kini tinggal di panel
 * Bukti Dukung Prodi.
 */
export function buildProgramActivity({
	siklusAktif,
	chapters,
	maxBab = MAX_PROGRAM_ACTIVITY_SHOWN - 1,
}: {
	siklusAktif: LedProjectEntity | null;
	chapters: ChapterEntity[];
	maxBab?: number;
}): ProgramActivity[] {
	if (!siklusAktif) return [];

	const activities: ProgramActivity[] = pickRecentChapterSaves(
		chapters,
		maxBab,
	).map((chapter) => ({
		kind: 'BAB',
		waktu: chapter.terakhirDisimpan!,
		judul: `Bab ${chapter.urutanBab}. ${chapter.judulBab}`,
		keterangan: 'Disimpan',
	}));

	activities.push({
		kind: 'DOKUMEN',
		waktu: siklusAktif.createdAt,
		judul: siklusAktif.judul,
		keterangan: 'Siklus dimulai',
	});

	return activities;
}
