import * as React from 'react';

import { chapterRepository } from '../../data/repositories/chapter.repository';
import { sectionDraftRepository } from '../../data/repositories/section-draft.repository';
import { type ChapterSectionEntity } from '../../domain/entities/chapter-section.entity';
import { type SectionDraftEntity } from '../../domain/entities/section-draft.entity';
import { type ChapterPermission } from './use-chapter-permission';

export type StatusSectionDraft = 'diam' | 'menyimpan' | 'memulihkan' | 'menghapus';

export type HasilPulihSection = {
	html: string;
	section: ChapterSectionEntity;
};

/**
 * Isi tab Draft saat sebuah section terbuka: riwayat checkpoint SECTION itu
 * (bukan bab utuh), pembuatan checkpoint baru, dan pemulihan salah satunya.
 *
 * Pasangan section-level dari `use-chapter-draft.ts` — checkpoint bab lama
 * (`ChapterDraft`, arsip bukti dukung + ragas) tetap ada untuk alur generate,
 * ini murni "simpan/pulihkan tulisan section yang sedang dibuka".
 *
 * `sectionId` boleh `null` (tampilan bab-penuh, belum ada section dipilih) --
 * hook tidak memuat apa pun sampai section dibuka, sama pola dengan
 * `useChapterChat`.
 */
export function useSectionDraft({
	chapterId,
	sectionId,
	izin,
	ambilSnapshot,
}: {
	chapterId: string;
	sectionId: string | null;
	izin: ChapterPermission;
	/** Flush autosave section ini lalu kembalikan isinya yang benar-benar terkini. */
	ambilSnapshot: () => Promise<ChapterSectionEntity | undefined>;
}) {
	const [daftar, setDaftar] = React.useState<SectionDraftEntity[]>([]);
	const [label, setLabel] = React.useState('');
	const [status, setStatus] = React.useState<StatusSectionDraft>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);

	const muat = React.useCallback(() => {
		if (!sectionId) {
			setDaftar([]);
			return;
		}
		sectionDraftRepository.findBySectionId(chapterId, sectionId).then(setDaftar);
	}, [chapterId, sectionId]);

	React.useEffect(() => {
		muat();
		window.addEventListener('storage-update', muat);
		return () => window.removeEventListener('storage-update', muat);
	}, [muat]);

	const sibuk = status !== 'diam';

	const simpanCheckpoint = React.useCallback(async () => {
		if (!sectionId || !izin.canEdit || sibuk) return;

		setStatus('menyimpan');
		setPesanGagal(null);

		const section = await ambilSnapshot();

		if (!section || !section.konten) {
			setStatus('diam');
			setPesanGagal(
				'Section ini belum punya tulisan, jadi belum ada yang bisa disimpan sebagai checkpoint.',
			);
			return;
		}

		try {
			await sectionDraftRepository.create({
				chapterId,
				sectionId,
				label: label.trim() === '' ? null : label.trim(),
			});
			setLabel('');
		} catch {
			setPesanGagal('Gagal menyimpan checkpoint. Coba lagi.');
		} finally {
			setStatus('diam');
		}
	}, [chapterId, sectionId, izin.canEdit, sibuk, ambilSnapshot, label]);

	const pulihkan = React.useCallback(
		async (draft: SectionDraftEntity): Promise<HasilPulihSection | null> => {
			if (!sectionId || !izin.canEdit || sibuk) return null;

			setStatus('memulihkan');
			setPesanGagal(null);

			try {
				const diperbarui = await sectionDraftRepository.restore(
					chapterId,
					sectionId,
					draft.id,
				);
				return { html: diperbarui.konten ?? '', section: diperbarui };
			} catch {
				setPesanGagal('Gagal memulihkan checkpoint. Coba lagi.');
				return null;
			} finally {
				setStatus('diam');
			}
		},
		[chapterId, sectionId, izin.canEdit, sibuk],
	);

	/**
	 * Hapus satu checkpoint dari riwayat. Hanya membuang arsipnya -- tulisan
	 * section TIDAK ikut hilang (itu hidup di ChapterSection.content). Daftarnya
	 * tersegarkan lewat `storage-update` yang dikirim repository.
	 */
	/**
	 * Hapus satu draft. Mengembalikan isi section SESUDAH penghapusan supaya
	 * pemanggil bisa menyegarkan kanvas tanpa muat ulang halaman -- menghapus
	 * draft yang sedang tampil membuat backend berpindah ke versi tersisa (atau
	 * mengosongkan section kalau itu yang terakhir), dan editor tidak tahu
	 * apa-apa soal itu sampai diberi tahu. `null` = gagal.
	 */
	const hapus = React.useCallback(
		async (draft: SectionDraftEntity): Promise<HasilPulihSection | null> => {
			if (!sectionId || !izin.canEdit || sibuk) return null;

			setStatus('menghapus');
			setPesanGagal(null);

			try {
				await sectionDraftRepository.remove(chapterId, sectionId, draft.id);
				const sesudah = (await chapterRepository.findSections(chapterId)).find(
					(s) => s.id === sectionId,
				);
				return sesudah ? { html: sesudah.konten ?? '', section: sesudah } : null;
			} catch {
				setPesanGagal('Gagal menghapus checkpoint. Coba lagi.');
				return null;
			} finally {
				setStatus('diam');
			}
		},
		[chapterId, sectionId, izin.canEdit, sibuk],
	);

	return {
		daftar,
		label,
		setLabel,
		status,
		sibuk,
		pesanGagal,
		bisaDisimpan: !!sectionId,
		simpanCheckpoint,
		pulihkan,
		hapus,
	};
}
