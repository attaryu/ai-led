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

export type AutosaveStatus = 'diam' | 'menyimpan' | 'tersimpan';

export type ChapterAutosave = {
	status: AutosaveStatus;
	/** ISO simpan terakhir; satu-satunya sumber label "Tersimpan …". */
	savedAt: string | null;
	/** Dipanggil dari `onUpdate` Tiptap. Murah: hanya menaruh nilai di ref. */
	markDirty: (konten: string) => void;
	/** Menulis sekarang juga bila masih ada perubahan tertunda. */
	flush: () => void;
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
	savedAtAwal,
	enabled,
}: {
	chapterId: string;
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
	 */
	const tulisUntuk = React.useCallback(
		(idTujuan: string, alasan: 'jeda' | 'flush') => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}

			const konten = kontenRef.current;
			if (konten === null || !enabledRef.current) return;

			kontenRef.current = null;
			kotorSejakRef.current = null;

			const tersimpan = chapterRepository.updateKonten(idTujuan, konten);
			// `undefined` berarti repository menolak — bab dikunci dari tempat lain
			// di sela ketikan. Diamkan: memaksakan tulisan justru melanggar §12.2,
			// dan spanduk kunci akan muncul saat halamannya dibaca ulang.
			if (!tersimpan) return;

			// Indikator hanya boleh bergerak untuk bab yang sedang dilihat. Saat
			// simpanan ini milik bab yang baru saja ditinggalkan, babnya sudah
			// tidak di layar dan menyentuh state di sini hanya akan menyalakan
			// "Tersimpan" palsu di bab yang baru dibuka.
			if (idTujuan === chapterId) {
				setSavedAt(tersimpan.terakhirDisimpan);
				setStatus('tersimpan');
			}

			// Siarkan hanya saat ada fakta yang bisa dilihat orang lain berubah:
			// status bab di Daftar Isi dan di dashboard hanya bergerak saat bab
			// beralih antara kosong dan terisi. Menyiarkan tiap simpanan akan
			// memaksa seluruh pelanggan `storage-update` membaca ulang localStorage
			// tiap beberapa ketikan, demi status yang berubah paling banyak sekali
			// per sesi. Saat flush disiarkan juga, karena di situlah pengguna
			// meninggalkan bab dan tampilan lain sebentar lagi terpasang.
			const terisi = hasKonten(tersimpan);
			if (alasan === 'flush' || terisi !== terisiRef.current) {
				terisiRef.current = terisi;
				chapterRepository.notify();
			}
		},
		[chapterId],
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
				() => tulisRef.current(chapterId, 'jeda'),
				jeda,
			);
		},
		[chapterId],
	);

	const flush = React.useCallback(
		() => tulisRef.current(chapterId, 'flush'),
		[chapterId],
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
	 * masuk bfcache; tulisannya localStorage yang sinkron, jadi selalu tuntas.
	 */
	React.useEffect(() => {
		const onPageHide = () => tulisRef.current(chapterId, 'flush');
		window.addEventListener('pagehide', onPageHide);

		return () => {
			window.removeEventListener('pagehide', onPageHide);
			tulisRef.current(chapterId, 'flush');

			// Buffer dan jadwal milik bab ini tidak boleh menyeberang ke bab
			// berikutnya. Setelah flush di atas keduanya sudah kosong untuk jalur
			// normal; ini menutup jalur saat autosave sedang dimatikan (bab
			// terkunci atau role hanya baca) sehingga flush tadi tidak menulis.
			kontenRef.current = null;
			kotorSejakRef.current = null;
			terisiRef.current = null;
		};
	}, [chapterId]);

	// Bab berganti: indikator ikut menunjukkan stempel milik bab yang baru.
	// `savedAtAwal` sengaja bukan dependensi — ia ikut berubah tiap kali bab ini
	// disimpan, dan mengulang reset di situ akan mengedipkan status kembali ke
	// 'diam' persis sesudah 'tersimpan' muncul.
	const chapterSebelumnyaRef = React.useRef(chapterId);
	if (chapterSebelumnyaRef.current !== chapterId) {
		chapterSebelumnyaRef.current = chapterId;
		setSavedAt(savedAtAwal);
		setStatus('diam');
	}

	return { status, savedAt, markDirty, flush, adopt };
}
