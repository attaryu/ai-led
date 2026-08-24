import * as React from 'react';

import { evidenceRepository } from '~/features/evidence/data/repositories/evidence.repository';
import { evidenceFolderRepository } from '~/features/evidence/data/repositories/evidence-folder.repository';
import {
	jalurFolder,
	type EvidenceFolderEntity,
} from '~/features/evidence/domain/entities/evidence-folder.entity';
import {
	type EvidenceEntity,
	type EvidenceStatus,
} from '~/features/evidence/domain/entities/evidence.entity';
import { studyProgramRepository } from '~/features/study-program/data/repositories/study-program.repository';
import { chapterDraftRepository } from '../../data/repositories/chapter-draft.repository';
import { chapterRepository } from '../../data/repositories/chapter.repository';
import { generateChapterContent } from '../../data/sources/remote/chapter-generation.mock';
import { type BuktiDukungRef } from '../../domain/entities/bukti-dukung-ref.entity';
import { cariRekomendasiBelumAda } from '../../domain/entities/evidence-recommendation.entity';
import { type RagasScore } from '../../domain/entities/ragas-score.entity';
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
		buktiDukung: BuktiDukungRef[];
		referensiChunkIds: string[];
		ragas: RagasScore | null;
	} | null>(null);
	/** Versi checkpoint yang lahir dari hasil terakhir; `null` selama belum disimpan. */
	const [versiTersimpan, setVersiTersimpan] = React.useState<number | null>(null);

	/**
	 * Bukti dukung yang diunggah dari panel ini dan masih menunggu ekstraksinya
	 * selesai. Begitu statusnya `SIAP` ia dicentang sendiri: pengguna mengunggah
	 * berkas dari tab Generasi justru karena ingin memakainya untuk generate ini,
	 * jadi menyuruhnya mencari lagi berkasnya di daftar hanya menambah satu
	 * langkah tanpa menambah pilihan.
	 */
	const [menungguOtomatis, setMenungguOtomatis] = React.useState<
		ReadonlySet<string>
	>(() => new Set());

	/**
	 * Folder bukti dukung, dibaca **seluruhnya** tanpa disaring cakupan.
	 *
	 * `pustaka` di sini memang melintasi dua cakupan sekaligus — berkas prodi ini
	 * ditambah berkas universitas (§5.2) — jadi menyaring foldernya ke satu
	 * cakupan akan membuat jalur separuh berkas tidak terbaca. Id folder unik
	 * lintas cakupan, sehingga menaiki pohonnya tetap benar.
	 */
	const [folderPustaka, setFolderPustaka] = React.useState<
		EvidenceFolderEntity[]
	>([]);

	const muat = React.useCallback(() => {
		setPustaka(evidenceRepository.findAvailableForStudyProgram(studyProgramId));
		setFolderPustaka(evidenceFolderRepository.findAll());
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
		const dipulihkan = chapter.buktiDukung
			.map((ref) => ref.id)
			.filter((id) => masihBisaDipakai.has(id));

		setTerpilih(new Set(dipulihkan));
		setDasar(new Set(dipulihkan));

		/**
		 * Hanya yang **benar-benar lenyap** dari pustaka yang dihitung gugur —
		 * bukan setiap yang gagal dipulihkan.
		 *
		 * Bukti yang tidak tercentang karena statusnya belum `SIAP` tetap ada di
		 * daftar tepat di bawah kaki panel ini, lengkap dengan badge dan
		 * `catatanGagal`-nya. Mengumumkannya lagi di sini berarti menerangkan dua
		 * kali sesuatu yang sudah menerangkan diri — dan karena statusnya tidak
		 * berubah sendiri, catatannya menyala terus dan berhenti terbaca sebagai
		 * kabar. Efek auto-centang di bawah sudah memutuskan hal yang sama untuk
		 * berkas `GAGAL`; dulu dua tempat di berkas ini berselisih soal itu.
		 *
		 * Yang dihapus dari pustaka lain perkara: tidak ada satu pun tempat di
		 * layar yang bisa menunjukkannya, dan generate berikutnya akan berjalan
		 * dengan konteks lebih sedikit tanpa pemberitahuan.
		 */
		const adaDiPustaka = new Set(pustaka.map((bukti) => bukti.id));
		setJumlahGugur(
			chapter.buktiDukung.filter((ref) => !adaDiPustaka.has(ref.id)).length,
		);
	}

	/**
	 * Efek, bukan bagian dari `muat()`: pemulihan pilihan di atas berjalan di fase
	 * render dan **mengganti** seluruh isi `terpilih`. Mencentang dari dalam
	 * pemuatan berarti bertaruh siapa yang menulis belakangan; di sini ia dijamin
	 * berjalan sesudah keduanya selesai.
	 */
	React.useEffect(() => {
		if (menungguOtomatis.size === 0) return;

		const siap: string[] = [];
		const rampung: string[] = [];

		for (const id of menungguOtomatis) {
			const bukti = pustaka.find((kandidat) => kandidat.id === id);
			// Belum muncul di pustaka: daftarnya belum tersegarkan, tunggu putaran
			// `storage-update` berikutnya.
			if (!bukti) continue;

			if (bukti.status === STATUS_TERPAKAI) {
				siap.push(id);
				rampung.push(id);
			} else if (bukti.status === 'GAGAL') {
				// Berhenti menunggu tanpa pesan tambahan: badge `GAGAL` dan
				// `catatanGagal` di barisnya sudah jadi keterangannya.
				rampung.push(id);
			}
		}

		if (rampung.length === 0) return;

		if (siap.length > 0) {
			// Ditambahkan ke `terpilih` saja, tidak ke `dasar` — supaya ia terhitung
			// "baru" dan ikut terangkut tombol pembatalan, sama seperti centang manual.
			setTerpilih((sebelumnya) => {
				const berikutnya = new Set(sebelumnya);
				siap.forEach((id) => berikutnya.add(id));
				return berikutnya;
			});
		}

		setMenungguOtomatis((sebelumnya) => {
			const berikutnya = new Set(sebelumnya);
			rampung.forEach((id) => berikutnya.delete(id));
			return berikutnya;
		});
	}, [pustaka, menungguOtomatis]);

	/** Disodorkan ke modal unggah sebagai `onUploaded`. */
	const tandaiUnggahanBaru = React.useCallback((evidence: EvidenceEntity) => {
		setMenungguOtomatis((sebelumnya) => new Set(sebelumnya).add(evidence.id));
	}, []);

	/**
	 * Dibutuhkan modal unggah: label targetnya, sekaligus `studyProgramName` yang
	 * didenormalisasi ke baris bukti dukung yang tercipta.
	 */
	const namaProdi = React.useMemo(
		() =>
			studyProgramRepository.findById(studyProgramId)?.studyProgramName ?? null,
		[studyProgramId],
	);

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

	/**
	 * Jalur folder per berkas, untuk keterangan di bawah namanya (§4.6a).
	 *
	 * **Daftarnya tetap datar, tidak jadi pohon.** Pekerjaan panel ini memilih
	 * berkas mana yang menyuapi AI, bukan menjelajahi perpustakaan; menuntut
	 * penggunanya menelusuri folder di kolom 320 px menambah langkah tanpa
	 * menambah kejelasan. Yang benar-benar hilang tanpa folder cuma satu hal —
	 * kemampuan membedakan dua `LKPS_2026.xlsx` dari tempat berbeda — dan itu
	 * dijawab satu baris jalur, bukan satu mode navigasi baru.
	 *
	 * Berkas di akar tidak masuk peta: barisnya memang tidak menampilkan apa pun.
	 */
	const jalurBukti = React.useMemo(() => {
		const peta = new Map<string, string>();
		for (const bukti of pustaka) {
			if (bukti.folderId === null) continue;
			const jalur = jalurFolder(folderPustaka, bukti.folderId);
			if (jalur.length > 0) {
				peta.set(bukti.id, jalur.map((folder) => folder.nama).join(' / '));
			}
		}
		return peta;
	}, [pustaka, folderPustaka]);

	/**
	 * Bukti dukung yang dituntut kriteria bab ini tapi belum ada padanannya di
	 * pustaka (docs/application_flow.md §12.1b).
	 *
	 * Dihitung dari `pustaka` utuh, **bukan** dari `daftar` yang sudah tersaring
	 * kata kunci: yang dijawabnya pertanyaan "berkas ini sudah diunggah atau
	 * belum", bukan "sedang terlihat atau tidak". Membacanya dari `daftar` akan
	 * membuat mengetik `lkps` seolah melenyapkan enam dokumen sekaligus.
	 *
	 * Statusnya juga tidak disaring; alasannya di JSDoc
	 * `evidence-recommendation.entity.ts`. Karena ia menggantung pada `pustaka`,
	 * ia ikut `storage-update` yang sama dengan daftarnya — begitu unggahan
	 * mendarat, barisnya lenyap tanpa muat ulang dan tanpa spinner.
	 */
	const saranBukti = React.useMemo(
		() =>
			cariRekomendasiBelumAda({
				urutanBab: chapter.urutanBab,
				namaDokumen: pustaka.map((bukti) => bukti.namaDokumen),
			}),
		[chapter.urutanBab, pustaka],
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
			// Nama dan tipe dibekukan di sini, saat berkasnya masih ada — itulah yang
			// membuat tab Bukti tetap bisa menyebutnya kalau kelak dihapus.
			const rujukan: BuktiDukungRef[] = buktiTerpilih.map((bukti) => ({
				id: bukti.id,
				namaDokumen: bukti.namaDokumen,
				tipeFile: bukti.tipeFile,
			}));

			try {
				const { html, referensiChunkIds, ragas } = await generateChapterContent({
					judulBab: chapter.judulBab,
					urutanBab: chapter.urutanBab,
					buktiDukung: rujukan,
					prompt,
				});

				const diperbarui = chapterRepository.applyGenerate(chapter.id, {
					kontenKerja: html,
					buktiDukung: rujukan,
					ragas,
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
				setDasar(new Set(diperbarui.buktiDukung.map((ref) => ref.id)));
				// Catatan bukti yang gugur milik pemulihan pilihan lama; sesudah
				// generate baru ia tidak lagi menjelaskan apa pun.
				setJumlahGugur(0);
				setHasilTerakhir({
					buktiDukung: diperbarui.buktiDukung,
					referensiChunkIds,
					// Dibaca balik dari baris yang tersimpan, bukan dari `ragas` di atas:
					// yang di sana belum punya `dihitungPada`, yang distempel repository.
					ragas: diperbarui.ragas,
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
			buktiDukung: hasilTerakhir.buktiDukung,
			referensiChunkIds: hasilTerakhir.referensiChunkIds,
			ragas: hasilTerakhir.ragas,
			dibuatOlehUserId: izin.session.userId,
			dibuatOlehNama: izin.session.namaLengkap,
		});

		setVersiTersimpan(dibuat.versi);
	}, [enabled, izin.session, hasilTerakhir, versiTersimpan, chapter.id]);

	return {
		daftar,
		jalurBukti,
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
		/** Bukti dukung yang biasanya jadi tumpuan bab ini tapi belum ada (§12.1b). */
		saranBukti,
		namaProdi,
		tandaiUnggahanBaru,
		/** Unggahan dari panel ini yang masih menunggu ekstraksinya selesai. */
		jumlahMenungguOtomatis: menungguOtomatis.size,
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
