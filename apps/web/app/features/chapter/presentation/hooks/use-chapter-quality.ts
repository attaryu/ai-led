import * as React from 'react';

import { chapterRepository } from '../../data/repositories/chapter.repository';
import { chapterDraftRemoteSource } from '../../data/sources/remote/chapter-draft.remote-source';
import { type SectionSumber } from '../../domain/entities/chunk-sumber.entity';
import { type ChapterDraftEntity } from '../../domain/entities/chapter-draft.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { ragasBasi } from '../../domain/entities/ragas-score.entity';

/** Lebih lama dari ini sejak generate, penanda `pending` dianggap penilaian yang tidak selesai. */
const BATAS_NILAI_MS = 20 * 60 * 1000;

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
	sectionId,
	savedAt,
}: {
	chapter: ChapterEntity;
	/** Section terbuka -> judge milik generate terakhir section itu (dimas: Kualitas per section). */
	sectionId: string | null;
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

	/**
	 * `chapter.id` di sini adalah id `BabDokumen` sungguhan — lihat catatan
	 * migrasi di `chapter-draft.remote-source.ts`. `terakhirDisimpan` ikut jadi
	 * dependency, bukan cuma `id`: itulah penanda checkpoint baru mungkin lahir
	 * dari tab Generasi sebelahnya (`@updatedAt` ikut bergerak tiap generate
	 * menulis checkpoint) — tanpa ini daftarnya cuma segar sesudah bab dibuka
	 * ulang.
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

	const [sumberSection, setSumberSection] = React.useState<SectionSumber>(null);
	const [memicu, setMemicu] = React.useState(false);
	const [galatPicu, setGalatPicu] = React.useState<string | null>(null);

	/**
	 * Tombol "Nilai kualitas": memicu job PENILAIAN_RAGAS. Backend menandai run-nya `pending`
	 * seketika, jadi pembacaan ulang langsung sesudahnya sudah menampilkan "sedang dinilai"
	 * dan polling di bawah mengambil alih sampai skornya masuk.
	 */
	const mintaNilai = React.useCallback(async () => {
		if (!sectionId) return;
		setMemicu(true);
		setGalatPicu(null);
		try {
			await chapterRepository.triggerQualityEvaluation(chapter.id, sectionId);
			setSumberSection(await chapterRepository.findSourcesForSection(chapter.id, sectionId));
		} catch (e) {
			setGalatPicu(e instanceof Error ? e.message : 'Gagal memulai penilaian.');
		} finally {
			setMemicu(false);
		}
	}, [chapter.id, sectionId]);

	/**
	 * Skor RAGAS dihitung susulan (beberapa menit setelah generate). Selama `pending` dan belum
	 * melewati batas, baca ulang tiap 10 dtk; lewat batas = penilaian tidak selesai (mis. worker
	 * mati di tengah jalan), berhenti menunggu.
	 */
	const sedangDinilai =
		!!sumberSection?.judgeTertunda &&
		Date.now() - Date.parse(sumberSection.digenerateAt) < BATAS_NILAI_MS;
	const penilaianMacet = !!sumberSection?.judgeTertunda && !sedangDinilai;
	React.useEffect(() => {
		if (!sectionId || !sedangDinilai) return;
		const timer = window.setInterval(() => {
			chapterRepository
				.findSourcesForSection(chapter.id, sectionId)
				.then(setSumberSection)
				.catch(() => undefined);
		}, 10_000);
		return () => window.clearInterval(timer);
	}, [chapter.id, sectionId, sedangDinilai]);
	// Generate section TIDAK menggerakkan `chapter.terakhirDisimpan`, jadi tab yang sedang terbuka (tombol
	// Generate ada di toolbar, bukan di tab ini) tidak tahu ada generate baru dan memperlihatkan data
	// lama -- sampai halaman dimuat ulang. Hook generate memanggil `chapterRepository.notify()` begitu
	// selesai; di sini event itu memicu baca ulang.
	const [segarkan, setSegarkan] = React.useState(0);
	React.useEffect(() => {
		const naik = () => setSegarkan((n) => n + 1);
		window.addEventListener('storage-update', naik);
		return () => window.removeEventListener('storage-update', naik);
	}, []);

	// Ganti bab/section = mulai dari kosong (jangan menampilkan data section sebelumnya).
	React.useEffect(() => {
		setSumberSection(null);
	}, [chapter.id, sectionId]);
	// Baca ulang TANPA mengosongkan dulu, supaya pembaruan karena event tidak berkedip.
	React.useEffect(() => {
		if (!sectionId) return;
		let dibatalkan = false;
		chapterRepository
			.findSourcesForSection(chapter.id, sectionId)
			.then((hasil) => {
				if (!dibatalkan) setSumberSection(hasil);
			})
			.catch(() => undefined);
		return () => {
			dibatalkan = true;
		};
	}, [chapter.id, sectionId, chapter.terakhirDisimpan, segarkan]);

	if (sectionId) {
		return {
			daftarDraft: [] as ChapterDraftEntity[],
			lingkup: 'aktif',
			setLingkup,
			draftTerpilih: undefined,
			ragas: sumberSection?.ragas ?? null,
			basi: ragasBasi(sumberSection?.ragas ?? null, savedAt),
			section: sumberSection,
			sedangDinilai,
			penilaianMacet,
			mintaNilai,
			memicu,
			galatPicu,
		};
	}

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
		section: null as SectionSumber,
		sedangDinilai: false,
		penilaianMacet: false,
		mintaNilai,
		memicu,
		galatPicu,
	};
}
