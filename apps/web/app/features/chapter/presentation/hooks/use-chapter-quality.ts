import * as React from 'react';

import { chapterDraftRepository } from '../../data/repositories/chapter-draft.repository';
import { type ChapterDraftEntity } from '../../domain/entities/chapter-draft.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { ragasBasi } from '../../domain/entities/ragas-score.entity';

/**
 * Isi tab Kualitas AI: metrik RAGAS milik generate terakhir
 * (docs/application_flow.md §10).
 *
 * **Tidak punya satu pun aksi.** §10.1 dan §12.1 menyatakan skornya dihitung
 * otomatis begitu generate selesai, tanpa pemicu manual terpisah — jadi hook ini
 * murni membaca. Yang mengisinya adalah tab Generasi.
 *
 * Lingkupnya bisa dipilih seperti tab Bukti; state-nya dipegang sendiri di
 * sini karena tidak ada tab lain yang perlu mengarahkannya.
 */
export function useChapterQuality({
	chapter,
	savedAt,
}: {
	chapter: ChapterEntity;
	/**
	 * Stempel simpan terakhir dari `useChapterAutosave`, **bukan**
	 * `chapter.terakhirDisimpan`.
	 *
	 * Bedanya menentukan: prop `chapter` berasal dari state yang hanya bergerak
	 * saat generate atau restore, sedangkan autosave menulis langsung ke
	 * penyimpanan tanpa melewatinya — dan sengaja tidak menyiarkan tiap simpanan
	 * demi tidak memaksa seluruh pelanggan membaca ulang localStorage tiap
	 * beberapa ketikan. Dengan `chapter.terakhirDisimpan`, penanda basi tidak akan
	 * pernah menyala walau babnya sudah disunting.
	 */
	savedAt: string | null;
}) {
	const [daftarDraft, setDaftarDraft] = React.useState<ChapterDraftEntity[]>([]);
	const [lingkup, setLingkup] = React.useState<string>('aktif');

	const muat = React.useCallback(() => {
		setDaftarDraft(chapterDraftRepository.findByChapterId(chapter.id));
	}, [chapter.id]);

	React.useEffect(() => {
		muat();
		window.addEventListener('storage-update', muat);
		return () => window.removeEventListener('storage-update', muat);
	}, [muat]);

	const draftTerpilih = daftarDraft.find((draft) => draft.id === lingkup);
	const lingkupEfektif = lingkup !== 'aktif' && !draftTerpilih ? 'aktif' : lingkup;

	const ragas =
		lingkupEfektif === 'aktif' ? chapter.ragas : (draftTerpilih?.ragas ?? null);

	/**
	 * Hanya lingkup aktif yang bisa basi — `kontenSnapshot` checkpoint memang tidak
	 * bisa berubah, jadi skornya selamanya menggambarkan isi yang dinilainya.
	 */
	const basi =
		lingkupEfektif === 'aktif' ? ragasBasi(chapter.ragas, savedAt) : false;

	return {
		daftarDraft,
		lingkup: lingkupEfektif,
		setLingkup,
		draftTerpilih,
		ragas,
		basi,
	};
}
