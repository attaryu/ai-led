import * as React from 'react';

import { chapterRepository } from '../../data/repositories/chapter.repository';
import { hasKonten } from '../../domain/entities/chapter.entity';

/** Jeda diam sebelum menyimpan; cukup panjang untuk tidak menulis tiap huruf. */
const JEDA_DIAM_MS = 800;
/**
 * Batas atas menunggu. Debounce murni akan kehilangan segalanya untuk pengguna
 * yang mengetik tanpa henti semenit lalu menutup tab, jadi begitu ada perubahan
 * tertunda selama ini, simpanannya dipaksa jalan.
 */
const PLAFON_MS = 5000;

export type AutosaveStatus = 'diam' | 'menyimpan' | 'tersimpan' | 'gagal';

export type ChapterAutosave = {
	status: AutosaveStatus;
	/** ISO simpan terakhir; satu-satunya sumber label "Tersimpan …". */
	savedAt: string | null;
	/** Dipanggil dari `onUpdate` Tiptap. Murah: hanya menaruh nilai di ref. */
	markDirty: (konten: string) => void;
	/**
	 * Menulis sekarang juga bila masih ada perubahan tertunda. `true` bila
	 * kontennya sudah tersimpan di backend sesudah ini selesai (termasuk saat
	 * tidak ada yang tertunda); `false` bila ditolak/gagal — pemanggil yang
	 * butuh kepastian isi sudah sampai backend (mis. sebelum bikin checkpoint)
	 * wajib `await` dan cek balikannya.
	 */
	flush: () => Promise<boolean>;
	/**
	 * Mengakui tulisan yang sudah tersimpan **dari luar editor** — sejauh ini
	 * hanya hasil Generate (§12.1), yang menulis sendiri ke repository lalu
	 * mendorong isinya ke Tiptap.
	 *
	 * Wajib dipanggil, bukan pemanis. Saat pengguna mengetik lalu menekan
	 * Generate, ada simpanan tertunda yang memegang tulisan **sebelum** generate;
	 * kalau ia menyala setelah generate menulis, hasil generate tertimpa balik
	 * tanpa jejak. Ini membuang jadwal dan penyangga itu, lalu memindahkan
	 * indikator ke stempel waktu milik generate.
	 */
	adopt: (savedAtBaru: string) => void;
};

/**
 * Autosave Editor Bab (docs/application_flow.md §7.2).
 *
 * Kanvas membaca `kontenKerja` **sekali** saat editor dibuat dan tidak pernah
 * membacanya lagi; hook ini yang memegang arah sebaliknya. Itu sengaja: kalau
 * editor ikut berlangganan `storage-update` sementara autosave menyiarkannya,
 * tiap putaran simpanan akan memantul balik dan menimpa dokumen yang sedang
 * diketik. Stempel waktu untuk indikator pun diambil dari nilai balik repository,
 * bukan dari pembacaan ulang penyimpanan.
 */
export function useChapterAutosave({
	chapterId,
	sectionId = null,
	savedAtAwal,
	enabled,
}: {
	chapterId: string;
	/**
	 * Non-null → tulis ke SECTION ini (`ChapterSection.content`), bukan
	 * `kontenKerja` seluruh bab — kanvas sedang menampilkan satu sub-bab
	 * (`ChapterEditorWorkspace` di-`key` ulang tiap `sectionId` berganti,
	 * jadi tidak ada isi lintas-target yang bisa bertabrakan, sama seperti
	 * jaminan `chapterId` di bawah).
	 */
	sectionId?: string | null;
	/** `terakhirDisimpan` bab saat halaman dibuka. */
	savedAtAwal: string | null;
	/** `false` saat bab terkunci atau role hanya baca — hook jadi tidak menulis. */
	enabled: boolean;
}): ChapterAutosave {
	const [status, setStatus] = React.useState<AutosaveStatus>('diam');
	const [savedAt, setSavedAt] = React.useState<string | null>(savedAtAwal);

	const kontenRef = React.useRef<string | null>(null);
	const timerRef = React.useRef<number | null>(null);
	const kotorSejakRef = React.useRef<number | null>(null);
	/** Status terisi terakhir yang diketahui, untuk memutuskan kapan menyiarkan. */
	const terisiRef = React.useRef<boolean | null>(null);
	const enabledRef = React.useRef(enabled);
	enabledRef.current = enabled;

	/**
	 * Menyimpan isi yang tertunda ke **bab yang id-nya diberikan**, bukan ke bab
	 * yang sedang aktif.
	 *
	 * Idnya jadi parameter, bukan dibaca dari ref, karena inilah titik paling
	 * berbahaya di seluruh editor: saat pengguna pindah bab, React lebih dulu
	 * merender dengan `chapterId` baru lalu menjalankan cleanup efek yang lama.
	 * Kalau fungsi ini mengambil id dari ref yang sudah ikut diperbarui, tulisan
	 * bab lama akan tersimpan menimpa bab baru — kehilangan data yang senyap.
	 *
	 * `PATCH bab/:id` async, jadi buffer (`kontenRef`) baru dikosongkan setelah
	 * requestnya selesai — kalau gagal (bukan terkunci), buffer dipegang dan
	 * dicoba lagi biar ketikan tidak hilang.
	 */
	const tulisUntuk = React.useCallback(
		(idBabTujuan: string, idSectionTujuan: string | null, alasan: 'jeda' | 'flush'): Promise<boolean> => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}

			const konten = kontenRef.current;
			if (konten === null || !enabledRef.current) return Promise.resolve(true);

			const menujuTargetSaatIni = idBabTujuan === chapterId && idSectionTujuan === sectionId;
			if (menujuTargetSaatIni) setStatus('menyimpan');

			// Section: `ChapterSection` tidak punya kolom stempel waktu sendiri —
			// waktu klien dipakai apa adanya untuk indikator, bukan dibaca balik
			// dari server seperti bab. Broadcast `notify()` (KPI isi-vs-kosong
			// dashboard) juga dilewati: itu konsep per-bab, tidak ada padanannya
			// per-section.
			const simpan = idSectionTujuan
				? chapterRepository
						.updateSectionKonten(idBabTujuan, idSectionTujuan, konten)
						.then((ok) => (ok ? { savedAt: new Date().toISOString() as string | null, terisi: null } : null))
				: chapterRepository.updateKonten(idBabTujuan, konten).then((tersimpan) =>
						tersimpan ? { savedAt: tersimpan.terakhirDisimpan, terisi: hasKonten(tersimpan) } : null,
					);

			return simpan.then(
				(hasil) => {
					kontenRef.current = null;
					kotorSejakRef.current = null;

					// `null` = bab/section terkunci dari tempat lain. Diamkan, §12.2.
					if (!hasil) return false;

					// Hanya target yang sedang dilihat yang boleh gerak.
					if (menujuTargetSaatIni) {
						setSavedAt(hasil.savedAt);
						setStatus('tersimpan');
					}

					// Siarkan hanya saat kosong<->terisi berubah, atau saat flush —
					// tidak berlaku untuk section (lihat catatan `simpan` di atas).
					if (hasil.terisi !== null && (alasan === 'flush' || hasil.terisi !== terisiRef.current)) {
						terisiRef.current = hasil.terisi;
						chapterRepository.notify();
					}
					return true;
				},
				() => {
					// Jaringan/backend bermasalah, bukan terkunci — buffer dipegang, coba lagi.
					if (menujuTargetSaatIni) setStatus('gagal');
					timerRef.current = window.setTimeout(
						() => void tulisRef.current(idBabTujuan, idSectionTujuan, alasan),
						JEDA_DIAM_MS,
					);
					return false;
				},
			);
		},
		[chapterId, sectionId],
	);

	const tulisRef = React.useRef(tulisUntuk);
	tulisRef.current = tulisUntuk;

	const markDirty = React.useCallback(
		(konten: string) => {
			if (!enabledRef.current) return;

			kontenRef.current = konten;
			setStatus('menyimpan');

			const sekarang = Date.now();
			if (kotorSejakRef.current === null) kotorSejakRef.current = sekarang;

			if (timerRef.current !== null) window.clearTimeout(timerRef.current);

			// Sisa plafon menang atas jeda diam supaya ketikan tanpa henti tetap
			// tersimpan berkala, bukan tertahan sampai penggunanya berhenti.
			const sisaPlafon = PLAFON_MS - (sekarang - kotorSejakRef.current);
			const jeda = Math.max(0, Math.min(JEDA_DIAM_MS, sisaPlafon));

			timerRef.current = window.setTimeout(
				() => void tulisRef.current(chapterId, sectionId, 'jeda'),
				jeda,
			);
		},
		[chapterId, sectionId],
	);

	const flush = React.useCallback(
		() => tulisRef.current(chapterId, sectionId, 'flush'),
		[chapterId, sectionId],
	);

	// Harus dipanggil **sinkron** tepat sesudah penulisan generate: tidak ada
	// await di antaranya, sehingga tidak tersisa celah bagi jadwal lama untuk
	// menyala. `terisiRef` dipasang `true` karena generate selalu menulis isi —
	// tanpa itu simpanan berikutnya akan mengira babnya baru saja berubah dari
	// kosong dan menyiarkan ulang tanpa ada yang berubah.
	const adopt = React.useCallback((savedAtBaru: string) => {
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		kontenRef.current = null;
		kotorSejakRef.current = null;
		terisiRef.current = true;

		setSavedAt(savedAtBaru);
		setStatus('tersimpan');
	}, []);

	/**
	 * Titik siram yang tersisa: pindah bab, halaman dilepas, dan tab ditutup.
	 *
	 * `chapterId` ditangkap di lingkup efek ini, jadi cleanup-nya selalu menulis
	 * ke bab yang memang sedang dibuka saat efeknya dipasang — lihat alasan
	 * panjangnya di {@link tulisUntuk}. `pagehide` dipilih ketimbang
	 * `beforeunload` karena ia juga menyala di perangkat mobile dan saat halaman
	 * masuk bfcache.
	 *
	 * ponytail: lewat `fetch`, bukan localStorage sinkron — tab yang benar-benar
	 * ditutup bisa memutus request sebelum tuntas. Upgrade: sendBeacon endpoint.
	 */
	React.useEffect(() => {
		const onPageHide = () => void tulisRef.current(chapterId, sectionId, 'flush');
		window.addEventListener('pagehide', onPageHide);

		return () => {
			window.removeEventListener('pagehide', onPageHide);
			void tulisRef.current(chapterId, sectionId, 'flush');

			// Buffer dan jadwal milik bab ini tidak boleh menyeberang ke bab
			// berikutnya. Setelah flush di atas keduanya sudah kosong untuk jalur
			// normal; ini menutup jalur saat autosave sedang dimatikan (bab
			// terkunci atau role hanya baca) sehingga flush tadi tidak menulis.
			kontenRef.current = null;
			kotorSejakRef.current = null;
			terisiRef.current = null;
		};
	}, [chapterId, sectionId]);

	// Bab/section berganti: indikator ikut menunjukkan stempel milik target
	// yang baru. `savedAtAwal` sengaja bukan dependensi — ia ikut berubah tiap
	// kali bab ini disimpan, dan mengulang reset di situ akan mengedipkan
	// status kembali ke 'diam' persis sesudah 'tersimpan' muncul.
	const chapterSebelumnyaRef = React.useRef(`${chapterId}:${sectionId ?? ''}`);
	if (chapterSebelumnyaRef.current !== `${chapterId}:${sectionId ?? ''}`) {
		chapterSebelumnyaRef.current = `${chapterId}:${sectionId ?? ''}`;
		setSavedAt(savedAtAwal);
		setStatus('diam');
	}

	return { status, savedAt, markDirty, flush, adopt };
}
