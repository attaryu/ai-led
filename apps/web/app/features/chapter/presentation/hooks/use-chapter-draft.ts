import * as React from 'react';

import { chapterDraftRepository } from '../../data/repositories/chapter-draft.repository';
import { chapterRepository } from '../../data/repositories/chapter.repository';
import {
	labelDraft,
	type ChapterDraftEntity,
} from '../../domain/entities/chapter-draft.entity';
import {
	hasKonten,
	type ChapterEntity,
} from '../../domain/entities/chapter.entity';
import { type ChapterPermission } from './use-chapter-permission';

export type StatusDraft = 'diam' | 'menyimpan' | 'memulihkan';

export type HasilPulih = {
	html: string;
	chapter: ChapterEntity;
};

/**
 * Isi tab Draft: riwayat checkpoint bab ini, pembuatan checkpoint baru, dan
 * pemulihan ke salah satunya (docs/application_flow.md §8).
 *
 * Bentuknya mengikuti `useChapterGeneration` — hook memegang data dan state,
 * komponen memegang tampilan, dan hook **tidak pernah menyentuh Tiptap**:
 * `pulihkan` menulis ke repository lalu mengembalikan hasilnya, dan halaman
 * editor yang memutuskan kapan HTML itu masuk ke kanvas.
 */
export function useChapterDraft({
	chapter,
	izin,
	ambilSnapshot,
}: {
	chapter: ChapterEntity;
	izin: ChapterPermission;
	/**
	 * Mengembalikan baris bab yang **benar-benar terkini**, sesudah simpanan
	 * autosave yang tertunda disiram lebih dulu. Disediakan halaman editor karena
	 * hanya ia yang memegang instans autosave-nya.
	 *
	 * Ini bukan kerumitan yang bisa dilewati: tanpa penyiraman itu, checkpoint
	 * yang dibuat sedetik sesudah mengetik akan memuat isi **sebelum** ketikan
	 * tersebut — checkpoint yang berbohong tentang apa yang diamankannya.
	 */
	ambilSnapshot: () => Promise<ChapterEntity | undefined>;
}) {
	const [daftar, setDaftar] = React.useState<ChapterDraftEntity[]>([]);
	const [label, setLabel] = React.useState('');
	const [status, setStatus] = React.useState<StatusDraft>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	const muat = React.useCallback(() => {
		chapterDraftRepository.findByChapterId(chapter.id).then(setDaftar);
	}, [chapter.id]);

	// Checkpoint bisa lahir dari tab Generasi ("Simpan sebagai draft") maupun dari
	// tab ini, dan keduanya menyiarkan `storage-update`. Pola langganan yang sama
	// dipakai `useChapterGeneration` dan `useEvidenceLibrary`.
	React.useEffect(() => {
		muat();
		window.addEventListener('storage-update', muat);
		return () => window.removeEventListener('storage-update', muat);
	}, [muat]);

	const sibuk = status !== 'diam';

	const simpanCheckpoint = React.useCallback(async () => {
		if (!izin.canEdit || sibuk) return;

		setStatus('menyimpan');
		setPesanGagal(null);

		const bab = await ambilSnapshot();

		// §7.3/§8.1: checkpoint pertama baru mungkin sesudah bab punya isi, dan
		// flush di `ambilSnapshot` bisa saja ditolak (bab dikunci dari tempat lain).
		if (!bab || !hasKonten(bab)) {
			setStatus('diam');
			setPesanGagal(
				'Bab ini belum punya tulisan, jadi belum ada yang bisa disimpan sebagai checkpoint.',
			);
			return;
		}

		try {
			await chapterDraftRepository.create({
				chapterId: bab.id,
				label: label.trim() === '' ? null : label.trim(),
			});
			setLabel('');
		} catch {
			setPesanGagal('Gagal menyimpan checkpoint. Coba lagi.');
		} finally {
			setStatus('diam');
		}
	}, [izin.canEdit, sibuk, ambilSnapshot, label]);

	const pulihkan = React.useCallback(
		async (draft: ChapterDraftEntity): Promise<HasilPulih | null> => {
			if (!izin.canEdit || sibuk) return null;

			// Peringatannya menyebut akibat, bukan sekadar "yakin?" — mengikuti
			// kalimat konfirmasi di `evidence-library.tsx`. Wajib menyebut kehilangan
			// tulisan sekarang: docs tegas bahwa restore **tidak** membuat checkpoint
			// otomatis dari kondisi yang tertimpa, jadi ini satu-satunya peringatan
			// yang pengguna dapat.
			if (
				!confirm(
					`Pulihkan "${labelDraft(draft)}"? Tulisan bab yang sekarang akan tertimpa dan tidak tersimpan sebagai checkpoint.`,
				)
			) {
				return null;
			}

			setStatus('memulihkan');
			setPesanGagal(null);

			const diperbarui = await chapterRepository.restoreFromDraft(
				chapter.id,
				draft.kontenSnapshot,
			);

			setStatus('diam');

			// Satu-satunya alasan repository menolak: bab dikunci dari tempat lain
			// selagi tab ini terbuka (§12.2).
			if (!diperbarui) {
				setPesanGagal(
					'Bab ini dikunci Penjamin Mutu, jadi checkpoint tidak bisa dipulihkan.',
				);
				return null;
			}

			return { html: draft.kontenSnapshot, chapter: diperbarui };
		},
		[izin.canEdit, sibuk, chapter.id],
	);

	return {
		daftar,
		label,
		setLabel,
		status,
		sibuk,
		pesanGagal,
		/** `false` saat bab masih kosong — tombol simpan ikut mati. */
		bisaDisimpan: hasKonten(chapter),
		simpanCheckpoint,
		pulihkan,
	};
}
