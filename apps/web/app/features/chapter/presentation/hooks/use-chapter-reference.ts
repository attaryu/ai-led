import * as React from 'react';

import { evidenceRepository } from '~/features/evidence/data/repositories/evidence.repository';
import { type EvidenceEntity } from '~/features/evidence/domain/entities/evidence.entity';
import { chapterDraftRemoteSource } from '../../data/sources/remote/chapter-draft.remote-source';
import {
	kutipanUntukBukti,
	type KutipanChunk,
} from '../../data/sources/remote/chapter-chunk.mock';
import { type BuktiDukungRef } from '../../domain/entities/bukti-dukung-ref.entity';
import { type ChapterDraftEntity } from '../../domain/entities/chapter-draft.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';

export type BarisRujukan = {
	ref: BuktiDukungRef;
	/**
	 * Baris Perpustakaan yang masih hidup, atau `undefined` bila berkasnya sudah
	 * dihapus. Yang `undefined` **tetap ditampilkan** — nama dan tipenya sudah
	 * diarsipkan di `ref`, dan itulah gunanya.
	 */
	live: EvidenceEntity | undefined;
	/**
	 * Bagian berkas yang dipakai AI saat menyusun bab ini (§11.1a).
	 *
	 * Ikut dihitung untuk berkas yang sudah dihapus juga: kutipannya diturunkan
	 * dari `ref` yang diarsipkan, bukan dari berkas hidupnya, jadi jejaknya tetap
	 * terbaca — alasan yang sama yang membuat barisnya tetap ditampilkan.
	 */
	kutipan: KutipanChunk[];
};

/**
 * Isi tab Bukti: bukti dukung yang tercatat dipakai bab ini
 * (docs/application_flow.md §11.1), beserta kutipan yang diambil dari
 * masing-masing (§11.1a).
 *
 * Yang membuat hook ini tidak sekadar membaca satu larik: ada **dua sumber yang
 * sama-sama sah**. `ChapterEntity.buktiDukung` adalah kondisi aktif yang ditimpa
 * tiap generate/restore, sedangkan tiap `ChapterDraftEntity.buktiDukung` adalah
 * arsip permanen milik satu checkpoint. §11.1 hanya menyebut yang pertama, tapi
 * membatasi diri ke situ berarti arsip per checkpoint tidak pernah terlihat di
 * mana pun — padahal §8.1 sudah menunda penampilannya justru ke tab ini. Karena
 * itu lingkupnya bisa dipilih.
 */
export function useChapterReference({
	chapter,
	studyProgramId,
}: {
	chapter: ChapterEntity;
	studyProgramId: string;
}) {
	const [daftarDraft, setDaftarDraft] = React.useState<ChapterDraftEntity[]>([]);
	const [pustaka, setPustaka] = React.useState<EvidenceEntity[]>([]);
	/**
	 * `'aktif'` atau id salah satu checkpoint. Tidak perlu direset saat bab
	 * berganti: ruang kerja editor di-`key` oleh `chapter.id`, jadi seluruh panel
	 * memang terpasang ulang.
	 */
	const [lingkup, setLingkup] = React.useState<string>('aktif');

	/**
	 * Riwayat checkpoint dibaca dari backend sungguhan (`chapter.id` di sini
	 * adalah id `BabDokumen` sungguhan), sama seperti `pustaka` di bawah sejak
	 * Perpustakaan Bukti Dukung disambungkan ke `/bukti-dukung`.
	 *
	 * `terakhirDisimpan` ikut jadi dependency di samping `id` — penanda
	 * checkpoint baru mungkin lahir dari tab Generasi sebelahnya, sama seperti
	 * `useChapterQuality`.
	 */
	React.useEffect(() => {
		let dibatalkan = false;
		chapterDraftRemoteSource
			.findByChapterId(chapter.id)
			.then((drafts) => {
				if (!dibatalkan) setDaftarDraft(drafts);
			})
			.catch(() => {
				if (!dibatalkan) setDaftarDraft([]);
			});
		return () => {
			dibatalkan = true;
		};
	}, [chapter.id, chapter.terakhirDisimpan]);

	const muatPustaka = React.useCallback(() => {
		// Tenant + prodi bab ini sendiri — cakupan yang sama dengan
		// `findAvailableForStudyProgram` di tab Generasi, karena rujukan bab
		// hanya pernah datang dari salah satu dari dua sumber itu.
		evidenceRepository.findAvailableForStudyProgram(studyProgramId).then(setPustaka);
	}, [studyProgramId]);

	// Berkas bisa dihapus atau statusnya berubah dari tab lain.
	React.useEffect(() => {
		muatPustaka();
		window.addEventListener('storage-update', muatPustaka);
		return () => window.removeEventListener('storage-update', muatPustaka);
	}, [muatPustaka]);

	const draftTerpilih = daftarDraft.find((draft) => draft.id === lingkup);
	// Lingkup yang menunjuk checkpoint yang sudah tidak ada — hanya mungkin lewat
	// keadaan aneh — jatuh kembali ke aktif alih-alih menampilkan daftar kosong
	// tanpa penjelasan.
	const lingkupEfektif = lingkup !== 'aktif' && !draftTerpilih ? 'aktif' : lingkup;

	const rujukan = React.useMemo<BarisRujukan[]>(() => {
		const sumber =
			lingkupEfektif === 'aktif'
				? chapter.buktiDukung
				: (draftTerpilih?.buktiDukung ?? []);

		const perId = new Map(pustaka.map((bukti) => [bukti.id, bukti]));
		return sumber.map((ref) => ({
			ref,
			live: perId.get(ref.id),
			kutipan: kutipanUntukBukti({ urutanBab: chapter.urutanBab, ref }),
		}));
	}, [
		lingkupEfektif,
		chapter.buktiDukung,
		chapter.urutanBab,
		draftTerpilih,
		pustaka,
	]);

	const jumlahHilang = rujukan.filter((baris) => !baris.live).length;

	return {
		daftarDraft,
		lingkup: lingkupEfektif,
		setLingkup,
		draftTerpilih,
		rujukan,
		jumlahHilang,
	};
}
