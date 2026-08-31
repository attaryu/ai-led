import { ledProjectRepository } from '~/features/led-project/data/repositories/led-project.repository';
import {
	RUBRIK_KRITERIA,
	type RubricCriterion,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';
import {
	cekSyaratSiap,
	deriveSetLock,
	namaSalinan,
	type AccreditationSetDocument,
	type AccreditationSetEntity,
	type SetDocumentType,
	type SetStatus,
} from '../../domain/entities/accreditation-set.entity';
import { type CreateAccreditationSetDto } from '../../domain/dtos/create-accreditation-set.dto';
import { type UpdateAccreditationSetDto } from '../../domain/dtos/update-accreditation-set.dto';
import { accreditationSetLocalSource } from '../sources/local/accreditation-set-local.source';

const initialSets: AccreditationSetEntity[] = [
	{
		id: '1',
		nama: 'LAM-Teknik 2026',
		lembaga: 'LAM Teknik',
		tahunSiklus: 2026,
		status: 'SIAP',
		dokumen: [
			{
				tipe: 'DOKUMEN_RUBRIK',
				namaBerkas: 'Rubrik Penilaian LAM Teknik 2026.pdf',
				tipeBerkas: 'pdf',
				ukuranBytes: 2_412_544,
				diunggahPada: '2026-08-02T09:12:00.000Z',
				diunggahOleh: 'Siti Rahmawati',
			},
			{
				tipe: 'PANDUAN_LAM',
				namaBerkas: 'Panduan Penyusunan LED 2026.pdf',
				tipeBerkas: 'pdf',
				ukuranBytes: 5_118_976,
				diunggahPada: '2026-08-02T09:20:00.000Z',
				diunggahOleh: 'Siti Rahmawati',
			},
			{
				tipe: 'TEMPLATE_LKPS',
				namaBerkas: 'Template LKPS 2026.docx',
				tipeBerkas: 'docx',
				ukuranBytes: 743_424,
				diunggahPada: '2026-08-02T09:24:00.000Z',
				diunggahOleh: 'Siti Rahmawati',
			},
		],
		// Isi rubriknya sudah lengkap dan terkunci — set inilah yang dipakai dua
		// Dokumen LED contoh, jadi keadaan "tidak bisa diubah lagi" punya wujud
		// begitu halamannya dibuka.
		kriteria: RUBRIK_KRITERIA,
		createdAt: '2026-08-02T09:00:00.000Z',
	},
	{
		// Sengaja belum lengkap dan masih draf, supaya kedua keadaan itu ada
		// wujudnya di layar tanpa perlu menyiapkan data sendiri.
		id: '2',
		nama: 'LAM-Infokom 2025',
		lembaga: 'LAM Infokom',
		tahunSiklus: 2025,
		status: 'DRAF',
		// Berkasnya lengkap dan isinya sudah terbaca, jadi set ini tinggal
		// ditandai siap — satu-satunya keadaan yang memperlihatkan gerbang itu
		// terbuka. Draf yang berkasnya masih kurang tetap punya wujud lewat set
		// yang baru dibuat, yang selalu lahir tanpa berkas sama sekali.
		dokumen: [
			{
				tipe: 'DOKUMEN_RUBRIK',
				namaBerkas: 'Rubrik LAM Infokom 2025.pdf',
				tipeBerkas: 'pdf',
				ukuranBytes: 1_884_160,
				diunggahPada: '2026-08-19T14:05:00.000Z',
				diunggahOleh: 'Siti Rahmawati',
			},
			{
				tipe: 'PANDUAN_LAM',
				namaBerkas: 'Panduan Penyusunan LED Infokom 2025.pdf',
				tipeBerkas: 'pdf',
				ukuranBytes: 3_512_320,
				diunggahPada: '2026-08-19T14:11:00.000Z',
				diunggahOleh: 'Siti Rahmawati',
			},
			{
				tipe: 'TEMPLATE_LKPS',
				namaBerkas: 'Template LKPS Infokom 2025.docx',
				tipeBerkas: 'docx',
				ukuranBytes: 689_152,
				diunggahPada: '2026-08-19T14:14:00.000Z',
				diunggahOleh: 'Siti Rahmawati',
			},
		],
		kriteria: RUBRIK_KRITERIA.slice(6, 12),
		createdAt: '2026-08-19T14:00:00.000Z',
	},
	{
		// Sudah siap tapi belum dipakai dokumen mana pun — keadaan yang
		// memperlihatkan bahwa status siap sendiri tidak mengunci apa pun: set ini
		// masih bebas disunting dan dihapus, karena belum ada skor yang menunjuk ke
		// kriterianya.
		id: '3',
		nama: 'LAM-Teknik 2023',
		lembaga: 'LAM Teknik',
		tahunSiklus: 2023,
		status: 'SIAP',
		dokumen: [
			{
				tipe: 'DOKUMEN_RUBRIK',
				namaBerkas: 'Rubrik Penilaian LAM Teknik 2023.pdf',
				tipeBerkas: 'pdf',
				ukuranBytes: 2_105_344,
				diunggahPada: '2026-08-05T08:30:00.000Z',
				diunggahOleh: 'Siti Rahmawati',
			},
			{
				tipe: 'PANDUAN_LAM',
				namaBerkas: 'Panduan Penyusunan LED 2023.pdf',
				tipeBerkas: 'pdf',
				ukuranBytes: 4_398_080,
				diunggahPada: '2026-08-05T08:36:00.000Z',
				diunggahOleh: 'Siti Rahmawati',
			},
			{
				tipe: 'TEMPLATE_LKPS',
				namaBerkas: 'Template LKPS 2023.docx',
				tipeBerkas: 'docx',
				ukuranBytes: 712_704,
				diunggahPada: '2026-08-05T08:41:00.000Z',
				diunggahOleh: 'Siti Rahmawati',
			},
		],
		// Siklus lama, jadi rubriknya sengaja lebih pendek — supaya dua set siap
		// tidak terlihat sebagai salinan yang sama persis.
		kriteria: RUBRIK_KRITERIA.slice(0, 6),
		createdAt: '2026-08-05T08:00:00.000Z',
	},
];

/**
 * Mengisi field yang belum ada pada baris lama di localStorage — alasan dan
 * pola sama dengan `normalize` di `study-program.repository.ts`.
 */
function normalize(set: Partial<AccreditationSetEntity>): AccreditationSetEntity {
	return {
		id: set.id ?? '',
		nama: set.nama ?? '',
		lembaga: set.lembaga ?? 'Belum diisi',
		tahunSiklus: set.tahunSiklus ?? new Date().getFullYear(),
		status: (set.status as SetStatus | undefined) ?? 'DRAF',
		dokumen: set.dokumen ?? [],
		kriteria: set.kriteria ?? [],
		createdAt: set.createdAt ?? new Date().toISOString(),
	};
}

function read(): AccreditationSetEntity[] {
	const raw = accreditationSetLocalSource.getAll();

	if (!raw) {
		accreditationSetLocalSource.setAll(JSON.stringify(initialSets));
		return initialSets;
	}

	return (JSON.parse(raw) as Partial<AccreditationSetEntity>[]).map(normalize);
}

function write(sets: AccreditationSetEntity[]): void {
	accreditationSetLocalSource.setAll(JSON.stringify(sets));
	window.dispatchEvent(new Event('storage-update'));
}

/**
 * Jeda tiruan untuk unggah berkas. Bukan hiasan: ini menempati posisi yang
 * nanti diisi PUT ke penyimpanan objek, sehingga keadaan "sedang mengunggah"
 * di layar sudah punya wujud sejak sekarang dan tidak perlu ditambahkan
 * belakangan saat jalur aslinya masuk.
 */
function simulateUpload(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 700));
}

function extensionOf(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/** Satu kriteria tanpa `id` — bentuk yang datang dari formulir. */
export type CriterionInput = Omit<RubricCriterion, 'id'>;

/** Menyimpan satu set yang berubah ke dalam daftarnya, lalu mengembalikannya. */
function commit(
	sets: AccreditationSetEntity[],
	updated: AccreditationSetEntity,
): AccreditationSetEntity {
	write(sets.map((set) => (set.id === updated.id ? updated : set)));
	return updated;
}

/**
 * Menolak setiap perubahan isi pada set yang sudah terkunci, dengan alasan yang
 * sama persis dengan yang dibaca pengguna di layar — `deriveSetLock` yang
 * menyusunnya, jadi tidak ada dua kalimat yang bisa menyimpang.
 *
 * Penjagaan ini ada di repository, bukan cuma di tombol yang disembunyikan:
 * layar kriteria bisa saja masih terbuka saat set yang sama ditandai siap dari
 * tab lain, dan yang menyimpan tetap harus ditolak.
 */
async function requireUnlocked(setId: string): Promise<{
	sets: AccreditationSetEntity[];
	target: AccreditationSetEntity;
}> {
	const sets = read();
	const target = sets.find((set) => set.id === setId);

	if (!target) throw new Error('Set akreditasi tidak ditemukan');

	const dipakai = ledProjectRepository
		.findAll()
		.filter((project) => project.accreditationSetId === setId).length;
	const lock = deriveSetLock(dipakai);

	if (!lock.terbuka) {
		throw new Error(lock.alasan ?? 'Set ini terkunci.');
	}

	return { sets, target };
}

/**
 * Menolak perubahan yang membuat set berstatus `SIAP` tidak lagi memenuhi
 * syaratnya.
 *
 * Set siap sengaja tidak dikunci — yang mengunci adalah pemakaian — tapi
 * "tidak dikunci" bukan berarti boleh dikosongkan. Tanpa penjagaan ini, berkas
 * atau kriteria terakhir bisa dihapus dari set yang sudah siap, dan ia tetap
 * ditawarkan ke proyek dalam keadaan tidak utuh. Draf tidak tersentuh aturan
 * ini: ia memang sedang disusun.
 */
function assertMasihSahSebagaiSiap(set: AccreditationSetEntity): void {
	if (set.status !== 'SIAP') return;

	const halangan = cekSyaratSiap(set);
	if (halangan) throw new Error(halangan);
}

/** `abaikanId` menjaga kriteria yang sedang dikoreksi tidak bentrok dengan dirinya sendiri. */
function assertNomorBebas(
	set: AccreditationSetEntity,
	no: number,
	abaikanId: string,
): void {
	const bentrok = set.kriteria.some(
		(k) => k.no === no && k.id !== abaikanId,
	);

	if (bentrok) {
		throw new Error(`Nomor indikator ${no} sudah dipakai kriteria lain di set ini.`);
	}
}

/**
 * Satu-satunya titik yang tahu dari mana data set berasal. Ketika endpoint
 * backend-nya lahir, hanya isi fungsi-fungsi di berkas ini yang berubah —
 * seluruh halaman tetap memanggil nama yang sama dengan bentuk yang sama.
 *
 * Sengaja `async` walau sumbernya localStorage yang sinkron, mengikuti bentuk
 * repository yang dipakai di branch integrasi, supaya pemanggilnya tidak perlu
 * diubah saat sumbernya ditukar.
 */
export const accreditationSetRepository = {
	async findAll(): Promise<AccreditationSetEntity[]> {
		return read();
	},

	async findById(id: string): Promise<AccreditationSetEntity | undefined> {
		return read().find((set) => set.id === id);
	},

	/**
	 * Set yang boleh dipilih sebuah Dokumen LED — hanya yang berstatus `SIAP`.
	 *
	 * Draf sengaja tidak ikut: isinya masih bisa berubah, dan dokumen yang
	 * terlanjur memilihnya akan mendapati rubriknya bergeser di tengah
	 * penyusunan. Penyaringan ditaruh di repository, bukan di daftar pilihan,
	 * supaya aturannya tetap berlaku dari mana pun pilihan itu dibuka.
	 */
	async findSelectable(): Promise<AccreditationSetEntity[]> {
		return read().filter((set) => set.status === 'SIAP');
	},

	async create(input: CreateAccreditationSetDto): Promise<AccreditationSetEntity> {
		const sets = read();
		const created: AccreditationSetEntity = {
			id: crypto.randomUUID(),
			nama: input.nama,
			lembaga: input.lembaga,
			tahunSiklus: input.tahunSiklus,
			status: 'DRAF',
			dokumen: [],
			kriteria: [],
			createdAt: new Date().toISOString(),
		};

		write([...sets, created]);
		return created;
	},

	async update(
		id: string,
		input: UpdateAccreditationSetDto,
	): Promise<AccreditationSetEntity> {
		const sets = read();
		const target = sets.find((set) => set.id === id);

		if (!target) throw new Error('Set akreditasi tidak ditemukan');

		const updated: AccreditationSetEntity = { ...target, ...input };
		write(sets.map((set) => (set.id === id ? updated : set)));
		return updated;
	},

	/**
	 * Menghapus set. Ditolak bila masih ada Dokumen LED yang menunjuk ke sini —
	 * menghapusnya berarti membuat dokumen itu kehilangan acuan penilaiannya
	 * tanpa pemiliknya tahu, dan skor yang sudah tersimpan kehilangan arti.
	 *
	 * Penolakannya dilempar dari sini, bukan dijaga tampilan, karena tampilan
	 * bukan satu-satunya yang bisa memanggilnya — dan nanti aturan yang sama
	 * akan datang dari server dalam bentuk yang persis begini.
	 */
	async delete(id: string): Promise<void> {
		const dipakai = await this.countUsage(id);

		if (dipakai > 0) {
			throw new Error(
				`Set ini masih dipakai ${dipakai} Dokumen LED, jadi tidak bisa dihapus.`,
			);
		}

		write(read().filter((set) => set.id !== id));
	},

	/**
	 * Berapa Dokumen LED yang memakai set ini.
	 *
	 * Dihitung dari sisi dokumen, bukan disimpan sebagai penghitung di set:
	 * penghitung berarti ada angka kedua yang harus ikut turun setiap kali
	 * dokumen dihapus atau berpindah set, dan satu jalur yang lupa
	 * memperbaruinya sudah cukup membuat set terkunci selamanya tanpa sebab.
	 */
	async countUsage(setId: string): Promise<number> {
		return ledProjectRepository
			.findAll()
			.filter((project) => project.accreditationSetId === setId).length;
	},

	/**
	 * Mengisi satu slot berkas. Slot yang sudah terisi langsung ditimpa — dari
	 * sudut pandang pengguna itulah arti "ganti berkas", dan menyimpan dua
	 * berkas pada satu slot tidak punya makna.
	 */
	async attachDocument(
		id: string,
		tipe: SetDocumentType,
		file: File,
		diunggahOleh: string,
	): Promise<AccreditationSetEntity> {
		await simulateUpload();

		const sets = read();
		const target = sets.find((set) => set.id === id);

		if (!target) throw new Error('Set akreditasi tidak ditemukan');

		const dokumen: AccreditationSetDocument = {
			tipe,
			namaBerkas: file.name,
			tipeBerkas: extensionOf(file.name),
			ukuranBytes: file.size,
			diunggahPada: new Date().toISOString(),
			diunggahOleh,
		};

		const updated: AccreditationSetEntity = {
			...target,
			dokumen: [...target.dokumen.filter((d) => d.tipe !== tipe), dokumen],
		};

		write(sets.map((set) => (set.id === id ? updated : set)));
		return updated;
	},

	async removeDocument(
		id: string,
		tipe: SetDocumentType,
	): Promise<AccreditationSetEntity> {
		const sets = read();
		const target = sets.find((set) => set.id === id);

		if (!target) throw new Error('Set akreditasi tidak ditemukan');

		const updated: AccreditationSetEntity = {
			...target,
			dokumen: target.dokumen.filter((d) => d.tipe !== tipe),
		};

		assertMasihSahSebagaiSiap(updated);

		write(sets.map((set) => (set.id === id ? updated : set)));
		return updated;
	},
	/**
	 * Membetulkan satu kriteria yang sudah ada.
	 *
	 * **Tidak ada pasangan `addCriterion`, dan itu disengaja.** Isi rubrik turun
	 * dari lembaga penilai lewat berkas yang diunggah; yang dikerjakan orang di
	 * sini hanya membetulkan baris yang salah terbaca. Saat ekstraksi berkas
	 * rubrik tersedia nanti, yang masuk adalah penulisan sekaligus satu daftar
	 * penuh, bukan penambahan satu per satu.
	 *
	 * Nomor indikator tetap harus unik dalam satu set: ia dipakai sebagai kunci
	 * hasil penilaian (`IndicatorResult.indicatorNo`), jadi nomor kembar membuat
	 * dua baris hasil saling menimpa tanpa satu pun pesan.
	 */
	async updateCriterion(
		setId: string,
		criterionId: string,
		input: CriterionInput,
	): Promise<AccreditationSetEntity> {
		const { sets, target } = await requireUnlocked(setId);
		assertNomorBebas(target, input.no, criterionId);

		if (!target.kriteria.some((k) => k.id === criterionId)) {
			throw new Error('Kriteria tidak ditemukan');
		}

		return commit(sets, {
			...target,
			kriteria: target.kriteria.map((k) =>
				k.id === criterionId ? { ...input, id: criterionId } : k,
			),
		});
	},

	async removeCriterion(
		setId: string,
		criterionId: string,
	): Promise<AccreditationSetEntity> {
		const { sets, target } = await requireUnlocked(setId);
		const updated: AccreditationSetEntity = {
			...target,
			kriteria: target.kriteria.filter((k) => k.id !== criterionId),
		};

		assertMasihSahSebagaiSiap(updated);

		return commit(sets, updated);
	},

	/**
	 * Menandai set siap dipakai, yaitu **membuka gerbangnya** supaya ia muncul di
	 * daftar pilihan Dokumen LED. Bukan penguncian: set siap yang belum dipakai
	 * siapa pun masih bebas disunting, karena belum ada skor yang menunjuk ke
	 * kriterianya. Yang mengunci adalah pemakaian, lihat `requireUnlocked`.
	 *
	 * Sekali jalan — tidak ada jalan balik ke draf. Menariknya kembali berarti
	 * mencabut set dari daftar pilihan sementara mungkin ada dokumen yang sedang
	 * dalam proses memilihnya; kalau acuannya memang keliru, `duplicate` yang
	 * dipakai.
	 */
	async markReady(setId: string): Promise<AccreditationSetEntity> {
		const sets = read();
		const target = sets.find((set) => set.id === setId);

		if (!target) throw new Error('Set akreditasi tidak ditemukan');
		if (target.status === 'SIAP') {
			throw new Error('Set ini sudah ditandai siap.');
		}

		const halangan = cekSyaratSiap(target);
		if (halangan) throw new Error(halangan);

		return commit(sets, { ...target, status: 'SIAP' });
	},

	/**
	 * Menyalin set jadi draf baru — satu-satunya cara merevisi acuan yang sudah
	 * terkunci. Berkas ikut disalin karena versi baru hampir selalu berangkat
	 * dari berkas yang sama; yang tidak ikut hanya statusnya, yang selalu mulai
	 * dari `DRAF` supaya salinannya wajib ditinjau ulang sebelum dipakai.
	 */
	async duplicate(setId: string): Promise<AccreditationSetEntity> {
		const sets = read();
		const target = sets.find((set) => set.id === setId);

		if (!target) throw new Error('Set akreditasi tidak ditemukan');

		const salinan: AccreditationSetEntity = {
			...target,
			id: crypto.randomUUID(),
			nama: namaSalinan(
				target.nama,
				sets.map((set) => set.nama),
			),
			status: 'DRAF',
			// Id kriteria ikut dibuat ulang: dua set yang berbagi id kriteria akan
			// membuat hasil penilaian dokumen lama terbaca seolah menunjuk kriteria
			// milik salinannya.
			kriteria: target.kriteria.map((k) => ({ ...k, id: crypto.randomUUID() })),
			createdAt: new Date().toISOString(),
		};

		write([...sets, salinan]);
		return salinan;
	},
};
