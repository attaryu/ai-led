import * as React from 'react';

import { chapterRepository } from '../../data/repositories/chapter.repository';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type ChapterPermission } from './use-chapter-permission';

export type ChapterReview = {
	/** `false` untuk semua role selain Penjamin Mutu (§15). */
	boleh: boolean;
	pesanGagal: string | null;
	/** Membalik kunci review. Satu aksi, tanpa perantara — §12.2. */
	toggleKunci: () => void;
	/** Menulis catatan; teks kosong berarti mencabutnya. */
	simpanCatatan: (catatan: string) => void;
	/** `false` untuk siapa pun selain Penyusun pemilik dokumen. */
	bolehMengajukan: boolean;
	/** Mengantrekan bab untuk direview, atau mencabut antreannya. */
	ajukanReview: (diajukan: boolean) => void;
};

/**
 * Aksi review Penjamin Mutu (docs/application_flow.md §12.2), sebentuk dengan
 * `useChapterDraft`: hak diperiksa di sini, penulisannya diserahkan ke
 * repository, dan hasilnya disusulkan ke pemanggil lewat `onReviewed`.
 *
 * Aksi-aksinya terpisah, bukan satu `terapkan(input)` yang generik — ketiganya
 * ditulis dari tempat berbeda (tombol header, tab Review sisi PM, tab Review
 * sisi Penyusun), dan nama yang menyebut maksudnya menutup jalan untuk
 * memanggilnya setengah.
 *
 * Hook ini dipakai **dua peran**, jadi penjaganya juga dua: `canReview` untuk
 * kunci dan catatan (Penjamin Mutu), `canSubmitReview` untuk pengajuan
 * (Penyusun). Keduanya bukan satu-satunya lapis — tombolnya memang tidak
 * dirender untuk role lain — tapi merekalah yang membuat hook ini aman dipanggil
 * dari mana pun tanpa pemanggilnya perlu mengulang aturannya.
 */
export function useChapterReview(
	chapter: ChapterEntity,
	izin: ChapterPermission,
	onReviewed: (diperbarui: ChapterEntity) => void,
): ChapterReview {
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	const boleh = izin.canReview && Boolean(izin.session);

	// Satu-satunya sebab penolakan repository adalah babnya sudah tidak ada —
	// terhapus bersama dokumennya dari tab lain sementara editor masih terbuka.
	const susulkan = React.useCallback(
		(diperbarui: ChapterEntity | undefined) => {
			if (!diperbarui) {
				setPesanGagal('Bab ini sudah tidak ada. Muat ulang halaman.');
				return;
			}
			setPesanGagal(null);
			onReviewed(diperbarui);
		},
		[onReviewed],
	);

	const toggleKunci = React.useCallback(() => {
		if (!izin.canReview) return;
		susulkan(chapterRepository.setTerkunci(chapter.id, !chapter.terkunci));
	}, [chapter.id, chapter.terkunci, izin.canReview, susulkan]);

	const simpanCatatan = React.useCallback(
		(catatan: string) => {
			if (!izin.canReview || !izin.session) return;
			susulkan(
				chapterRepository.setCatatanPenjaminMutu(chapter.id, catatan, {
					namaLengkap: izin.session.namaLengkap,
				}),
			);
		},
		[chapter.id, izin.canReview, izin.session, susulkan],
	);

	const ajukanReview = React.useCallback(
		(diajukan: boolean) => {
			if (!izin.canSubmitReview) return;
			susulkan(chapterRepository.setDiajukanReview(chapter.id, diajukan));
		},
		[chapter.id, izin.canSubmitReview, susulkan],
	);

	return {
		boleh,
		pesanGagal,
		toggleKunci,
		simpanCatatan,
		bolehMengajukan: izin.canSubmitReview,
		ajukanReview,
	};
}
