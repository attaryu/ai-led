import * as React from 'react';

import { evidenceRepository } from '~/features/evidence/data/repositories/evidence.repository';
import {
	type EvidenceEntity,
	type EvidenceStatus,
} from '~/features/evidence/domain/entities/evidence.entity';
import { chapterDraftRepository } from '../../data/repositories/chapter-draft.repository';
import { chapterRepository } from '../../data/repositories/chapter.repository';
import { generateChapterContent } from '../../data/sources/remote/chapter-generation.mock';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type ChapterPermission } from './use-chapter-permission';

/**
 * Hanya bukti dukung yang isinya sudah terekstraksi boleh jadi konteks AI
 * (docs/application_flow.md §4.5). Sisanya tetap tampil — statusnya justru
 * penjelasan kenapa ia belum bisa dipakai.
 */
const STATUS_TERPAKAI: EvidenceStatus = 'SIAP';

/**
 * Yang siap dipakai selalu di atas; sisanya menyusul mengikuti perjalanan
 * berkasnya. Nilainya sengaja sama dengan `statusOrder` di `evidence.repository`
 * supaya urutan status di seluruh aplikasi tidak berselisih pendapat.
 */
const URUTAN_STATUS: Record<EvidenceStatus, number> = {
	SIAP: 0,
	DIPROSES: 1,
	MENUNGGU: 2,
	GAGAL: 3,
};

export type StatusGenerate = 'diam' | 'berjalan' | 'gagal';

export type HasilGenerate = {
	html: string;
	chapter: ChapterEntity;
};

/**
 * Isi tab Generasi: daftar bukti dukung yang boleh dipakai bab ini, pilihan
 * penggunanya, arahan tambahan, dan pemanggilan generate itu sendiri
 * (docs/application_flow.md §12.1).
 *
 * Bentuknya mengikuti `useEvidenceLibrary`: hook memegang data dan state,
 * komponen memegang tampilan. Yang berbeda, di sini daftarnya tidak dipaginasi —
 * pemilihan konteks menuntut seluruh pustaka terlihat sekaligus, dan `findAvailableForStudyProgram`
 * memang sudah mengembalikan semuanya dalam satu larik.
 *
 * Hook ini sengaja **tidak** menyentuh editor. `jalankanGenerate` menulis ke
 * repository lalu mengembalikan hasilnya; yang memutuskan kapan HTML itu masuk
 * ke Tiptap adalah halaman editor, satu-satunya tempat yang memegang instansnya.
 */
export function useChapterGeneration({
	chapter,
	studyProgramId,
	izin,
}: {
	chapter: ChapterEntity;
	/** `studyProgramId` milik dokumennya — menentukan pustaka mana yang terbaca. */
	studyProgramId: string;
	/** Hak akses bab; `canEdit` mematikan generate, `session` mengisi pembuat draft. */
	izin: ChapterPermission;
}) {
	const enabled = izin.canEdit;
	const [pustaka, setPustaka] = React.useState<EvidenceEntity[]>([]);
	const [kataKunci, setKataKunci] = React.useState('');
	const [prompt, setPrompt] = React.useState('');
	const [terpilih, setTerpilih] = React.useState<ReadonlySet<string>>(
		() => new Set(),
	);
	/**
	 * Pilihan yang sudah tercatat di `BUKTI_DUKUNG_BAB` — titik nol yang dipakai
	 * membedakan "sudah dipakai generate sebelumnya" dari "baru dicentang barusan".
	 * Hanya yang kedua yang perlu bisa dibatalkan sekaligus.
	 */
	const [dasar, setDasar] = React.useState<ReadonlySet<string>>(() => new Set());
	const [status, setStatus] = React.useState<StatusGenerate>('diam');
	const [pesanGagal, setPesanGagal] = React.useState<string | null>(null);
	const [digenerateAt, setDigenerateAt] = React.useState<string | null>(null);
	/**
	 * Bahan generate terakhir, disimpan supaya hasilnya bisa diamankan jadi
	 * checkpoint bersumber `AI` (§8.2 — tetap satu klik user, bukan otomatis).
	 *
	 * Hidup di sini, bukan di `useChapterDraft`, karena inilah satu-satunya tempat
	 * `referensiChunkIds` pernah ada: begitu tab berganti atau generate diulang, ia
	 * hilang bersama hasil lamanya, dan memang seharusnya begitu.
	 */
	const [hasilTerakhir, setHasilTerakhir] = React.useState<{
		buktiDukungIds: string[];
		referensiChunkIds: string[];
	} | null>(null);
	/** Versi checkpoint yang lahir dari hasil terakhir; `null` selama belum disimpan. */
	const [versiTersimpan, setVersiTersimpan] = React.useState<number | null>(null);

	const muat = React.useCallback(() => {
		setPustaka(evidenceRepository.findAvailableForStudyProgram(studyProgramId));
	}, [studyProgramId]);

	// Ingestion bukti dukung berjalan di atas timer sungguhan (MENUNGGU →
	// DIPROSES → SIAP), dan unggahan baru bisa datang dari tab lain. Tanpa
	// langganan ini, berkas yang barusan selesai diproses akan tetap terlihat
	// mati sampai halaman dimuat ulang. Pola yang sama dipakai
	// `useEvidenceLibrary`.
	React.useEffect(() => {
		muat();
		window.addEventListener('storage-update', muat);
		return () => window.removeEventListener('storage-update', muat);
	}, [muat]);

	/**
	 * Pilihan generate sebelumnya dipulihkan sekali per bab, bukan tiap kali
	 * pustaka disegarkan — kalau tidak, tiap `storage-update` (mis. berkas lain
	 * selesai diproses) akan menghapus centang yang baru saja dibuat pengguna.
	 */
	const babTerakhirRef = React.useRef<string | null>(null);
	const [jumlahGugur, setJumlahGugur] = React.useState(0);

	if (babTerakhirRef.current !== chapter.id && pustaka.length > 0) {
		babTerakhirRef.current = chapter.id;

		const masihBisaDipakai = new Set(
			pustaka
				.filter((bukti) => bukti.status === STATUS_TERPAKAI)
				.map((bukti) => bukti.id),
		);
		const dipulihkan = chapter.buktiDukungIds.filter((id) =>
			masihBisaDipakai.has(id),
		);

		setTerpilih(new Set(dipulihkan));
		setDasar(new Set(dipulihkan));
		// Berkas bisa dihapus, atau statusnya mundur karena ingestion diulang.
		// Selisihnya ditampilkan, tidak dibuang diam-diam.
		setJumlahGugur(chapter.buktiDukungIds.length - dipulihkan.length);
	}

	/**
	 * Tiga kolom yang sama dengan `evidenceRepository.findPaged`, supaya mengetik
	 * kata yang sama di sini dan di Perpustakaan Bukti Dukung memberi hasil yang
	 * sama.
	 */
	const daftar = React.useMemo(() => {
		const kunci = kataKunci.trim().toLowerCase();
		const tersaring = kunci
			? pustaka.filter(
					(bukti) =>
						bukti.namaDokumen.toLowerCase().includes(kunci) ||
						bukti.uploadedByName.toLowerCase().includes(kunci) ||
						bukti.tipeFile.toLowerCase().includes(kunci),
				)
			: pustaka;

		return [...tersaring].sort((a, b) => {
			const selisihStatus = URUTAN_STATUS[a.status] - URUTAN_STATUS[b.status];
			if (selisihStatus !== 0) return selisihStatus;
			return b.waktuDiunggah.localeCompare(a.waktuDiunggah);
		});
	}, [pustaka, kataKunci]);

	const jumlahSiap = React.useMemo(
		() => pustaka.filter((bukti) => bukti.status === STATUS_TERPAKAI).length,
		[pustaka],
	);

	/** Penjagaan kedua di luar atribut `disabled` pada checkbox-nya. */
	const toggle = React.useCallback(
		(bukti: EvidenceEntity) => {
			if (bukti.status !== STATUS_TERPAKAI) return;

			setTerpilih((sebelumnya) => {
				const berikutnya = new Set(sebelumnya);
				if (!berikutnya.delete(bukti.id)) berikutnya.add(bukti.id);
				return berikutnya;
			});
		},
		[],
	);

	/**
	 * Membatalkan pencentangan yang dibuat sesi ini dan mengembalikan daftar ke
	 * pilihan generate terakhir. Untuk bab yang belum pernah digenerate,
	 * `dasar` kosong sehingga ini sama saja dengan membersihkan seluruh pilihan.
	 */
	const kembalikanKeDasar = React.useCallback(
		() => setTerpilih(new Set(dasar)),
		[dasar],
	);

	/** Berapa banyak yang dicentang di luar pilihan generate terakhir. */
	const jumlahBaru = React.useMemo(
		() => [...terpilih].filter((id) => !dasar.has(id)).length,
		[terpilih, dasar],
	);

	const jalankanGenerate =
		React.useCallback(async (): Promise<HasilGenerate | null> => {
			if (!enabled || status === 'berjalan' || terpilih.size === 0) return null;

			setStatus('berjalan');
			setPesanGagal(null);

			const buktiTerpilih = pustaka.filter((bukti) => terpilih.has(bukti.id));

			try {
				const { html, referensiChunkIds } = await generateChapterContent({
					judulBab: chapter.judulBab,
					urutanBab: chapter.urutanBab,
					buktiDukung: buktiTerpilih.map((bukti) => ({
						id: bukti.id,
						namaDokumen: bukti.namaDokumen,
					})),
					prompt,
				});

				const diperbarui = chapterRepository.applyGenerate(chapter.id, {
					kontenKerja: html,
					buktiDukungIds: buktiTerpilih.map((bukti) => bukti.id),
				});

				// Satu-satunya alasan repository menolak: bab dikunci dari tempat lain
				// selagi generate berjalan (§12.2).
				if (!diperbarui) {
					setStatus('gagal');
					setPesanGagal(
						'Bab ini dikunci Penjamin Mutu saat generate berjalan, jadi hasilnya tidak disimpan.',
					);
					return null;
				}

				setStatus('diam');
				setDigenerateAt(diperbarui.terakhirDisimpan);
				// Pilihan ini kini yang tercatat di babnya, jadi ia jadi titik nol
				// baru — pencentangan sesudah ini yang terhitung "baru".
				setDasar(new Set(diperbarui.buktiDukungIds));
				// Catatan bukti yang gugur milik pemulihan pilihan lama; sesudah
				// generate baru ia tidak lagi menjelaskan apa pun.
				setJumlahGugur(0);
				setHasilTerakhir({
					buktiDukungIds: diperbarui.buktiDukungIds,
					referensiChunkIds,
				});
				// Hasil ini belum diamankan; tawarannya muncul lagi.
				setVersiTersimpan(null);
				return { html, chapter: diperbarui };
			} catch {
				setStatus('gagal');
				setPesanGagal(
					'Generate gagal diselesaikan. Periksa koneksi lalu coba lagi.',
				);
				return null;
			}
		}, [enabled, status, terpilih, pustaka, chapter, prompt]);

	/**
	 * Mengamankan hasil generate terakhir jadi checkpoint bersumber `AI`
	 * (docs/application_flow.md §8.2).
	 *
	 * Tetap satu klik user, bukan otomatis tiap generate selesai — §8.2 melarang
	 * yang kedua, dan riwayat akan cepat penuh oleh percobaan generate kalau
	 * dibiarkan berjalan sendiri. Yang di-snapshot adalah `kontenKerja` bab, bukan
	 * HTML yang beredar di memori: `applyGenerate` sudah menuliskannya, jadi
	 * membacanya kembali menjamin arsipnya sama persis dengan yang tersimpan.
	 */
	const simpanSebagaiDraft = React.useCallback(() => {
		if (!enabled || !izin.session || !hasilTerakhir || versiTersimpan !== null) {
			return;
		}

		const bab = chapterRepository.findById(chapter.id);
		if (!bab?.kontenKerja) return;

		const dibuat = chapterDraftRepository.create({
			chapterId: bab.id,
			label: null,
			kontenSnapshot: bab.kontenKerja,
			sumber: 'AI',
			buktiDukungIds: hasilTerakhir.buktiDukungIds,
			referensiChunkIds: hasilTerakhir.referensiChunkIds,
			dibuatOlehUserId: izin.session.userId,
			dibuatOlehNama: izin.session.namaLengkap,
		});

		setVersiTersimpan(dibuat.versi);
	}, [enabled, izin.session, hasilTerakhir, versiTersimpan, chapter.id]);

	return {
		daftar,
		/** Total bukti sebelum disaring kata kunci — pembeda "kosong" vs "tak cocok". */
		totalPustaka: pustaka.length,
		jumlahSiap,
		kataKunci,
		setKataKunci,
		terpilih,
		toggle,
		kembalikanKeDasar,
		jumlahBaru,
		/** `true` bila bab ini sudah pernah digenerate — mengubah label pembatalan. */
		punyaDasar: dasar.size > 0,
		jumlahGugur,
		prompt,
		setPrompt,
		status,
		pesanGagal,
		digenerateAt,
		jalankanGenerate,
		/** `true` bila ada hasil generate yang belum diamankan jadi checkpoint. */
		bisaSimpanDraft: hasilTerakhir !== null && versiTersimpan === null,
		versiTersimpan,
		simpanSebagaiDraft,
	};
}
