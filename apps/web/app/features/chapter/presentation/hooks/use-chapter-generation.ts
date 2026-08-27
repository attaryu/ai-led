import * as React from 'react';

import { streamSse } from '~/core/lib/sse-client';
import { evidenceRepository, evidenceScopeFor } from '~/features/evidence/data/repositories/evidence.repository';
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
import { chapterRepository } from '../../data/repositories/chapter.repository';
import { chapterRemoteSource } from '../../data/sources/remote/chapter.remote-source';
import { cariRekomendasiBelumAda } from '../../domain/entities/evidence-recommendation.entity';
import { type ChapterEntity } from '../../domain/entities/chapter.entity';
import { type ChapterPermission } from './use-chapter-permission';

/** Bentuk event `GET jobs/:id/events` — lihat `job-events.service.ts::JobUpdate`. */
type JobEvent = {
	jobId: string;
	status: 'progress' | 'completed' | 'failed';
	result?: { status: 'completed' | 'error'; versi?: number; error?: string };
	error?: string;
};

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
	 * Versi `BabDraft` dari generate terakhir. Beda dari draf percobaan
	 * (`chapterDraftRepository`, tab Draft): worker GENERASI_BAB **selalu**
	 * membuat checkpoint sendiri tiap generate selesai (bukan opsional lewat
	 * tombol "simpan sebagai draft" seperti dulu) — nomor versinya diambil
	 * langsung dari hasil job, bukan dari aksi pengguna berikutnya.
	 */
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
		evidenceRepository.findAvailableForStudyProgram(studyProgramId).then(setPustaka);

		// Cakupan tenant + prodi ini sendiri, sama seperti `findAvailableForStudyProgram`
		// di atas — foldernya melintasi keduanya juga (lihat JSDoc `folderPustaka`).
		// Bagian tenant jatuh ke larik kosong bila ditolak (mis. role PENYUSUN),
		// mengikuti kendala yang sama.
		Promise.all([
			evidenceFolderRepository
				.findByScope(evidenceScopeFor({ ownerTipe: 'TENANT' }))
				.catch(() => []),
			evidenceFolderRepository.findByScope(
				evidenceScopeFor({ ownerTipe: 'PROGRAM_STUDI', studyProgramId }),
			),
		]).then(([tenant, prodi]) => setFolderPustaka([...tenant, ...prodi]));
	}, [studyProgramId]);

	// Ingestion bukti dukung berjalan async lewat job worker backend, dan
	// unggahan baru bisa datang dari tab lain. Tanpa langganan ini, berkas
	// yang barusan selesai diproses akan tetap terlihat mati sampai halaman
	// dimuat ulang. Pola yang sama dipakai `useEvidenceLibrary`.
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
	const [namaProdi, setNamaProdi] = React.useState<string | null>(null);
	React.useEffect(() => {
		let cancelled = false;
		studyProgramRepository.findById(studyProgramId).then((program) => {
			if (!cancelled) setNamaProdi(program?.studyProgramName ?? null);
		});
		return () => {
			cancelled = true;
		};
	}, [studyProgramId]);

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

	/**
	 * Memicu GENERASI_BAB sungguhan (Producer NestJS -> Worker FastAPI) lalu
	 * menunggu selesainya lewat `GET jobs/:id/events` (`streamSse`). Bukan lagi
	 * `generateChapterContent` (mock) + `chapterRepository.applyGenerate`
	 * (localStorage) — `chapter.id` di sini adalah id `BabDokumen` sungguhan,
	 * dan `applyGenerate` hanya menulis ke larik data contoh yang tidak
	 * memuatnya sama sekali (lihat catatan migrasi di `chapter.repository.ts`).
	 *
	 * Pemilihan bukti dukung & prompt tambahan: prompt sudah ikut terkirim ke
	 * worker (lihat `worker.py::_build_generasi_prompt`), tapi pemilihan bukti
	 * dukung **belum** — worker menjalankan pencarian bukti LED sendiri lewat
	 * pgvector, bukan menyaring dari `terpilih`. Daftarnya tetap ditampilkan
	 * sebagai konteks yang relevan buat penyusun, bukan kontrol yang benar-benar
	 * mengarahkan generate — celah ini dicatat di tracker, bukan ditutupi diam-diam.
	 *
	 * `draftId`, bila diisi pemanggil (`chapter-generation-panel.tsx`, gerbang
	 * konfirmasi rekomendasi dokumen), justru **membatasi** pencarian itu ke
	 * `selectedEvidenceIds` milik rekomendasi yang sudah `DIKONFIRMASI` — lihat
	 * `worker.py::_handle_generasi_bab`. Bab yang tidak pernah memicu alur
	 * rekomendasi memanggil ini tanpa argumen, tidak berubah dari sebelumnya.
	 */
	const jalankanGenerate =
		React.useCallback(async (draftId?: string): Promise<HasilGenerate | null> => {
			if (!enabled || status === 'berjalan' || terpilih.size === 0) return null;

			setStatus('berjalan');
			setPesanGagal(null);

			try {
				const job = await chapterRemoteSource.generate(
					chapter.id,
					prompt.trim() || undefined,
					draftId,
				);

				let hasilJob: JobEvent | null = null;
				for await (const event of streamSse<JobEvent>(`/jobs/${job.id}/events`)) {
					if (event.status === 'completed' || event.status === 'failed') {
						hasilJob = event;
						break;
					}
				}

				if (
					!hasilJob ||
					hasilJob.status === 'failed' ||
					hasilJob.result?.status === 'error'
				) {
					setStatus('gagal');
					setPesanGagal(
						hasilJob?.result?.error ??
							hasilJob?.error ??
							'Generate gagal diselesaikan. Periksa koneksi lalu coba lagi.',
					);
					return null;
				}

				const diperbarui = await chapterRepository.refreshFromBackend(chapter.id);

				setStatus('diam');
				setDigenerateAt(diperbarui.terakhirDisimpan);
				// Pilihan ini yang dipilih penyusun untuk generate ini, jadi ia jadi
				// titik nol baru buat "batalkan yang baru" walau backend belum
				// benar-benar menyaring dari pilihan ini (lihat catatan di atas).
				setDasar(new Set(terpilih));
				setJumlahGugur(0);
				// Worker sudah membuat checkpoint (BabDraft) sendiri tiap generate
				// selesai — versinya langsung dari hasil job, tidak menunggu klik
				// tambahan seperti draf manual dulu.
				setVersiTersimpan(hasilJob.result?.versi ?? null);

				return { html: diperbarui.kontenKerja ?? '', chapter: diperbarui };
			} catch {
				setStatus('gagal');
				setPesanGagal(
					'Generate gagal diselesaikan. Periksa koneksi lalu coba lagi.',
				);
				return null;
			}
		}, [enabled, status, terpilih, chapter, prompt]);

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
		// Worker membuat checkpoint sendiri tiap generate (lihat `jalankanGenerate`
		// di atas) — tidak pernah ada hasil yang "belum diamankan" menunggu klik
		// tambahan, jadi tombolnya tidak pernah perlu tampil.
		bisaSimpanDraft: false,
		versiTersimpan,
		simpanSebagaiDraft: () => {},
	};
}
