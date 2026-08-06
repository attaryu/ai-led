import * as React from 'react';

import { chapterDraftRepository } from '../../data/repositories/chapter-draft.repository';
import { chapterScoreRepository } from '../../data/repositories/chapter-score.repository';
import { scoreChapterContent } from '../../data/sources/remote/chapter-scoring.mock';
import {
	ringkasSkor,
	type ChapterScoreEntity,
} from '../../domain/entities/chapter-score.entity';
import { type ChapterDraftEntity } from '../../domain/entities/chapter-draft.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import {
	findKriteriaForBab,
	skorMaksimal,
} from '../../domain/entities/rubric-criterion.entity';
import { type ChapterPermission } from './use-chapter-permission';

export type StatusSimulasi = 'diam' | 'berjalan' | 'gagal';

/**
 * Isi tab Rubrik: kriteria LAM Teknik untuk bab ini, hasil simulasi skornya, dan
 * penjalanan simulasi itu sendiri (docs/application_flow.md §9).
 *
 * Lingkupnya bisa dipilih — kondisi aktif atau salah satu checkpoint — meniru
 * `useChapterReference`. §9.2 sebenarnya menuliskannya sebagai deretan card di
 * kaki tab yang membuka modal; dropdown dipilih supaya pertanyaan yang sama
 * ("lihat milik checkpoint mana") dijawab dengan kontrol yang sama di dua tab
 * bersebelahan.
 */
export function useChapterScore({
	chapter,
	izin,
	lingkup,
	setLingkup,
}: {
	chapter: ChapterEntity;
	izin: ChapterPermission;
	/**
	 * Diangkat ke halaman editor, bukan dipegang hook ini, supaya menu "Lihat
	 * skor" di tab Draft bisa mengarahkannya (§8.1).
	 */
	lingkup: string;
	setLingkup: (lingkup: string) => void;
}) {
	const [daftarDraft, setDaftarDraft] = React.useState<ChapterDraftEntity[]>([]);
	const [semuaHasil, setSemuaHasil] = React.useState<ChapterScoreEntity[]>([]);
	const [status, setStatus] = React.useState<StatusSimulasi>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	const muat = React.useCallback(() => {
		setDaftarDraft(chapterDraftRepository.findByChapterId(chapter.id));
		// Sekali baca lalu disaring di memori, bukan `findByTarget` per lingkup:
		// tiap panggilan repository membaca ulang seluruh blob localStorage.
		setSemuaHasil(chapterScoreRepository.findAll());
	}, [chapter.id]);

	React.useEffect(() => {
		muat();
		window.addEventListener('storage-update', muat);
		return () => window.removeEventListener('storage-update', muat);
	}, [muat]);

	const draftTerpilih = daftarDraft.find((draft) => draft.id === lingkup);
	// Lingkup yang menunjuk checkpoint yang sudah tidak ada jatuh kembali ke aktif,
	// alih-alih menampilkan daftar kosong tanpa penjelasan.
	const lingkupEfektif = lingkup !== 'aktif' && !draftTerpilih ? 'aktif' : lingkup;

	/** Kriteria dicocokkan lewat **nomor bab**, bukan id bab (database.md §11). */
	const kriteria = React.useMemo(
		() => findKriteriaForBab(chapter.urutanBab),
		[chapter.urutanBab],
	);

	const hasil = React.useMemo(() => {
		const perKriteria = new Map<string, ChapterScoreEntity>();
		for (const baris of semuaHasil) {
			const cocok =
				lingkupEfektif === 'aktif'
					? baris.targetTipe === 'BAB_AKTIF' && baris.babId === chapter.id
					: baris.targetTipe === 'BAB_DRAFT' &&
						baris.babDraftId === lingkupEfektif;
			if (cocok) perKriteria.set(baris.kriteriaId, baris);
		}
		return perKriteria;
	}, [semuaHasil, lingkupEfektif, chapter.id]);

	const ringkasan = React.useMemo(
		() => ringkasSkor([...hasil.values()], kriteria),
		[hasil, kriteria],
	);

	/**
	 * §9.3 dan §12.2 sekaligus: hanya Penjamin Mutu dan Penyusun yang boleh
	 * menjalankan, dan bab terkunci memblokir semua orang. Keduanya sudah
	 * terangkum di `canEdit`, jadi tidak perlu aturan kedua yang bisa menyimpang.
	 */
	const bolehMenjalankan = izin.canEdit && kriteria.length > 0;

	const jalankanSimulasi = React.useCallback(async () => {
		if (!bolehMenjalankan || !izin.session || status === 'berjalan') return;

		const konten =
			lingkupEfektif === 'aktif'
				? (chapter.kontenKerja ?? '')
				: (draftTerpilih?.kontenSnapshot ?? '');

		if (konten.trim() === '') {
			setStatus('gagal');
			setPesanGagal(
				'Belum ada tulisan yang bisa dinilai untuk lingkup yang dipilih.',
			);
			return;
		}

		setStatus('berjalan');
		setPesanGagal(null);

		try {
			const { hasil: dinilai } = await scoreChapterContent({
				konten,
				kriteria: kriteria.map((item) => ({
					id: item.id,
					kodeKriteria: item.kodeKriteria,
					skorMaksimal: skorMaksimal(item),
				})),
			});

			chapterScoreRepository.replaceForTarget(
				lingkupEfektif === 'aktif' ? 'BAB_AKTIF' : 'BAB_DRAFT',
				lingkupEfektif === 'aktif' ? chapter.id : lingkupEfektif,
				dinilai.map((baris) => ({
					kriteriaId: baris.kriteriaId,
					skorDidapat: baris.skorDidapat,
					justifikasi: baris.justifikasi,
					dijalankanOlehUserId: izin.session!.userId,
					dijalankanOlehNama: izin.session!.namaLengkap,
				})),
			);

			setStatus('diam');
		} catch {
			setStatus('gagal');
			setPesanGagal(
				'Simulasi gagal diselesaikan. Periksa koneksi lalu coba lagi.',
			);
		}
	}, [
		bolehMenjalankan,
		izin.session,
		status,
		lingkupEfektif,
		chapter,
		draftTerpilih,
		kriteria,
	]);

	return {
		daftarDraft,
		lingkup: lingkupEfektif,
		setLingkup,
		draftTerpilih,
		kriteria,
		hasil,
		ringkasan,
		status,
		pesanGagal,
		bolehMenjalankan,
		jalankanSimulasi,
	};
}
