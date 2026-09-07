import * as React from 'react';

import { chapterRepository } from '../../data/repositories/chapter.repository';
import { type SectionSumber } from '../../domain/entities/chunk-sumber.entity';

/**
 * Chunk asli yang dipakai AI menyusun SATU section, buat citation hover-card
 * (klik/hover "(sumber: X)" di narasi menampilkan isi X sungguhan) —
 * `chapter-citation-hover-card.tsx` memakainya.
 *
 * Diambil SEKALI per section, bukan per sitasi: satu section cuma punya satu
 * `GenerationRun` terbaru, jadi seluruh sitasi di section yang sama berbagi
 * daftar chunk yang sama, tinggal dicocokkan `label`-nya di sisi klien.
 *
 * `sectionId` undefined (mode kanvas gabungan seluruh bab, bukan satu section)
 * -> tidak fetch sama sekali, `sumber` tetap `undefined`. Chunk per-sitasi
 * cuma tercatat per section (lihat JSDoc `GenerationRun.sectionId`), jadi di
 * mode gabungan tidak ada cara tahu section mana pemilik sitasi yang diklik.
 */
export function useSectionSources(chapterId: string, sectionId: string | undefined) {
	const [sumber, setSumber] = React.useState<SectionSumber | undefined>(undefined);

	React.useEffect(() => {
		setSumber(undefined);
		if (!sectionId) return;

		let dibatalkan = false;
		void chapterRepository.findSourcesForSection(chapterId, sectionId).then((hasil) => {
			if (!dibatalkan) setSumber(hasil);
		});
		return () => {
			dibatalkan = true;
		};
	}, [chapterId, sectionId]);

	return sumber;
}
