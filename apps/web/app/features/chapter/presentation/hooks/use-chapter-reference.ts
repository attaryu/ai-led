import * as React from 'react';

import { evidenceRepository } from '~/features/evidence/data/repositories/evidence.repository';
import { type EvidenceEntity } from '~/features/evidence/domain/entities/evidence.entity';
import { chapterDraftRemoteSource } from '../../data/sources/remote/chapter-draft.remote-source';
import { chapterRepository } from '../../data/repositories/chapter.repository';
import { type PotonganTampil } from '../components/chapter-chunk-list';
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
	 * Potongan berkas yang benar-benar dipakai AI (§11.1a): chunk evidence dari
	 * generate terakhir tiap section (`GenerationRun.chunksUsed`). Hanya untuk
	 * lingkup aktif — checkpoint lama tidak membawa arsip chunk per berkas.
	 */
	kutipan: PotonganTampil[];
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
/** Satu sheet LKPS yang dipakai generate section (dimas Referensi: LKPS per sheet). */
export type LkpsTerpakai = { id: string; label: string; teks: string };

/** Satu chunk hasil RAG yang dipakai generate section -- satu kartu di tab Bukti. */
export type PotonganSumber = {
	id: string;
	jenis: 'lkps' | 'evidence';
	/** LKPS: "LKPS Sheet 6i". Evidence: nama berkas bila masih ada di Perpustakaan, selain itu label sitasi. */
	judul: string;
	/** Heading/bagian di dalam dokumen (evidence saja). */
	bagian: string | null;
	teks: string;
	buktiDukungId: string | null;
};

export function useChapterReference({
	chapter,
	studyProgramId,
	sectionId,
}: {
	chapter: ChapterEntity;
	studyProgramId: string;
	/** Section terbuka -> cuma bukti/LKPS yang dipakai generate section itu (dimas per section). */
	sectionId: string | null;
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

	/** Chunk evidence per bukti dukung, dari generate terakhir tiap section bab ini. */
	const [kutipanPerBukti, setKutipanPerBukti] = React.useState<Map<string, PotonganTampil[]>>(new Map());
	const [lkpsTerpakai, setLkpsTerpakai] = React.useState<LkpsTerpakai[]>([]);
	const [potonganMentah, setPotonganMentah] = React.useState<PotonganSumber[]>([]);
	/** Id bukti yang dipakai section terbuka; `null` = tampilan bab penuh (tanpa saringan). */
	const [buktiSection, setBuktiSection] = React.useState<Set<string> | null>(null);
	// Generate section tidak menggerakkan `chapter.terakhirDisimpan`; event `storage-update` dari hook generate
	// memicu baca ulang chunk yang dipakai, jadi tab Bukti tidak basi sampai halaman dimuat ulang.
	const [segarkan, setSegarkan] = React.useState(0);
	React.useEffect(() => {
		const naik = () => setSegarkan((n) => n + 1);
		window.addEventListener('storage-update', naik);
		return () => window.removeEventListener('storage-update', naik);
	}, []);
	React.useEffect(() => {
		let dibatalkan = false;
		(async () => {
			const semua = await chapterRepository.findSections(chapter.id);
			const sections = sectionId ? semua.filter((s) => s.id === sectionId) : semua;
			const sumber = await Promise.all(
				sections.map((s) =>
					chapterRepository.findSourcesForSection(chapter.id, s.id).then((hasil) => ({ s, hasil })),
				),
			);
			const peta = new Map<string, PotonganTampil[]>();
			const lkps: LkpsTerpakai[] = [];
			const mentah: PotonganSumber[] = [];
			const dipakai = new Set<string>();
			for (const { s, hasil } of sumber) {
				hasil?.selectedEvidenceIds.forEach((id) => dipakai.add(id));
				hasil?.chunks.forEach((chunk, i) => {
					if (chunk.jenis === 'lkps' || chunk.jenis === 'evidence') {
						mentah.push({
							id: `${s.id}-${i}`,
							jenis: chunk.jenis,
							judul: chunk.label,
							bagian: chunk.jenis === 'evidence' ? (chunk.bagian ?? null) : null,
							teks: chunk.teks,
							buktiDukungId: chunk.buktiDukungId,
						});
					}
					if (chunk.jenis === 'lkps') {
						lkps.push({ id: `${s.id}-${i}`, label: chunk.label, teks: chunk.teks });
						return;
					}
					if (chunk.jenis !== 'evidence' || !chunk.buktiDukungId) return;
					dipakai.add(chunk.buktiDukungId);
					const daftar = peta.get(chunk.buktiDukungId) ?? [];
					daftar.push({ id: `${s.id}-${i}`, kutipan: chunk.teks, asal: s.judul, judulBagian: null });
					peta.set(chunk.buktiDukungId, daftar);
				});
			}
			if (!dibatalkan) {
				setKutipanPerBukti(peta);
				setLkpsTerpakai(sectionId ? lkps : []);
				setPotonganMentah(sectionId ? mentah : []);
				setBuktiSection(sectionId ? dipakai : null);
			}
		})().catch(() => {
			if (!dibatalkan) setKutipanPerBukti(new Map());
		});
		return () => {
			dibatalkan = true;
		};
	}, [chapter.id, chapter.terakhirDisimpan, sectionId, segarkan]);

	const draftTerpilih = daftarDraft.find((draft) => draft.id === lingkup);
	// Lingkup yang menunjuk checkpoint yang sudah tidak ada — hanya mungkin lewat
	// keadaan aneh — jatuh kembali ke aktif alih-alih menampilkan daftar kosong
	// tanpa penjelasan.
	const lingkupEfektif = lingkup !== 'aktif' && !draftTerpilih ? 'aktif' : lingkup;

	const rujukan = React.useMemo<BarisRujukan[]>(() => {
		const sumber = sectionId
			? chapter.buktiDukung.filter((ref) => buktiSection?.has(ref.id))
			: lingkupEfektif === 'aktif'
				? chapter.buktiDukung
				: (draftTerpilih?.buktiDukung ?? []);

		const perId = new Map(pustaka.map((bukti) => [bukti.id, bukti]));
		return sumber.map((ref) => ({
			ref,
			live: perId.get(ref.id),
			kutipan: lingkupEfektif === 'aktif' ? (kutipanPerBukti.get(ref.id) ?? []) : [],
		}));
	}, [lingkupEfektif, chapter.buktiDukung, draftTerpilih, pustaka, kutipanPerBukti, sectionId, buktiSection]);

	const jumlahHilang = rujukan.filter((baris) => !baris.live).length;

	/** Chunk RAG section terbuka, nama berkas evidence diganti nama asli dari Perpustakaan bila ada. */
	const potongan = React.useMemo<PotonganSumber[]>(() => {
		const perId = new Map(pustaka.map((bukti) => [bukti.id, bukti.namaDokumen]));
		return potonganMentah.map((p) => ({
			...p,
			judul: (p.buktiDukungId && perId.get(p.buktiDukungId)) || p.judul,
		}));
	}, [potonganMentah, pustaka]);

	return {
		lkpsTerpakai,
		potongan,
		daftarDraft: sectionId ? [] : daftarDraft,
		lingkup: lingkupEfektif,
		setLingkup,
		draftTerpilih,
		rujukan,
		jumlahHilang,
	};
}
