import {
	dalamCakupan,
	folderAnak,
	keturunanIds,
	type EvidenceFolderEntity,
	type EvidenceScope,
} from '../../domain/entities/evidence-folder.entity';
import { evidenceFolderLocalSource } from '../sources/local/evidence-folder-local.source';

/** Tenant tunggal selama autentikasi belum terhubung ke backend. */
const CURRENT_TENANT_ID = '1';

/**
 * Struktur folder awal (docs/application_flow.md §4.6a).
 *
 * Tiga cakupan sengaja dibuat berbeda keadaannya supaya ketiganya terlihat sejak
 * muat pertama tanpa perlu menyiapkan apa pun:
 *
 * - **universitas** — tiga folder di akar, sebagian berkas dibiarkan di luar
 *   folder, sehingga daftar campuran folder + berkas terlihat
 * - **prodi 1** — bersarang dua tingkat, dan berkas `GAGAL`-nya ditaruh di
 *   tingkat terdalam supaya penanda "perlu perhatian" yang menaik lewat
 *   {@link hitungIsiFolder} benar-benar teruji
 * - **prodi 2 & 3** — tanpa folder sama sekali, yaitu keadaan perpustakaan datar
 *   seperti sebelum fitur ini ada
 *
 * Id-nya dibuat tetap (`fld-seed-*`) karena baris di `initialEvidences` menunjuk
 * ke sini lewat `folderId`; id acak akan membuat kedua seed lepas satu sama lain.
 */
const initialFolders: EvidenceFolderEntity[] = [
	{
		id: 'fld-seed-kebijakan',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		nama: 'Kebijakan & Statuta',
		parentId: null,
		dibuatOlehUserId: '2',
		dibuatOlehNama: 'Budi Pimpinan',
		waktuDibuat: '2026-07-18T01:00:00.000Z',
	},
	{
		id: 'fld-seed-laporan',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		nama: 'Laporan & Notulen',
		parentId: null,
		dibuatOlehUserId: '2',
		dibuatOlehNama: 'Budi Pimpinan',
		waktuDibuat: '2026-07-18T01:05:00.000Z',
	},
	{
		id: 'fld-seed-legalitas',
		ownerTipe: 'TENANT',
		tenantId: CURRENT_TENANT_ID,
		studyProgramId: null,
		nama: 'Sertifikat & Legalitas',
		parentId: null,
		dibuatOlehUserId: '3',
		dibuatOlehNama: 'Citra Penjamin Mutu',
		waktuDibuat: '2026-07-18T01:10:00.000Z',
	},
	{
		id: 'fld-seed-lkps',
		ownerTipe: 'PROGRAM_STUDI',
		tenantId: null,
		studyProgramId: '1',
		nama: 'LKPS',
		parentId: null,
		dibuatOlehUserId: '4',
		dibuatOlehNama: 'Dewi Penyusun',
		waktuDibuat: '2026-07-25T02:00:00.000Z',
	},
	{
		id: 'fld-seed-kriteria',
		ownerTipe: 'PROGRAM_STUDI',
		tenantId: null,
		studyProgramId: '1',
		nama: 'Kriteria',
		parentId: null,
		dibuatOlehUserId: '4',
		dibuatOlehNama: 'Dewi Penyusun',
		waktuDibuat: '2026-07-25T02:05:00.000Z',
	},
	{
		id: 'fld-seed-kriteria-4',
		ownerTipe: 'PROGRAM_STUDI',
		tenantId: null,
		studyProgramId: '1',
		nama: 'Kriteria 4 - SDM',
		parentId: 'fld-seed-kriteria',
		dibuatOlehUserId: '4',
		dibuatOlehNama: 'Dewi Penyusun',
		waktuDibuat: '2026-07-25T02:10:00.000Z',
	},
];

/**
 * Penghitung dalam modul, bukan bagian dari id-nya sendiri.
 *
 * `Date.now()` saja tidak cukup: {@link ensureFolderPaths} bisa membuat beberapa
 * folder dalam satu tick yang sama saat sebuah folder diunggah, dan seluruhnya
 * akan mendapat cap waktu identik — dua folder berbagi id berarti salah satunya
 * lenyap dari daftar tanpa jejak.
 */
let urutanFolder = 0;

function idFolderBaru(): string {
	urutanFolder += 1;
	return `fld-${Date.now().toString(36)}-${urutanFolder}`;
}

/**
 * Perpustakaan folder bukti dukung.
 *
 * **Hanya tahu soal folder.** Ia tidak pernah mengimpor `evidenceRepository`,
 * dan itu disengaja: arah impornya satu jalan (`evidence.repository` →
 * berkas ini), sehingga tidak ada lingkaran antara dua repository yang
 * dievaluasi saat modul dimuat. Akibatnya, seluruh operasi yang menyentuh
 * **kedua** koleksi — hapus berantai, hitung isi, susun daftar campuran — tinggal
 * di `evidence.repository`, yang memang sudah memegang berkasnya.
 *
 * Matematika pohonnya sendiri (jalur, keturunan, hitungan) tidak di sini
 * melainkan di `evidence-folder.entity.ts` sebagai fungsi murni, mengikuti
 * preseden `rubric-criterion.entity.ts`: yang butuh diuji dan dipakai ulang
 * jangan disandera lapis penyimpanan.
 */
export const evidenceFolderRepository = {
	findAll(): EvidenceFolderEntity[] {
		const stored = evidenceFolderLocalSource.getAll();
		if (!stored) {
			this.save(initialFolders);
			return initialFolders;
		}
		try {
			return JSON.parse(stored);
		} catch {
			this.save(initialFolders);
			return initialFolders;
		}
	},

	save(folders: EvidenceFolderEntity[]): void {
		evidenceFolderLocalSource.setAll(JSON.stringify(folders));
	},

	/** Event yang sama dengan fitur lain supaya polanya seragam. */
	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	/** Seluruh folder satu cakupan. Pemanggil yang menelusuri pohonnya. */
	findByScope(cakupan: EvidenceScope): EvidenceFolderEntity[] {
		return this.findAll().filter((folder) => dalamCakupan(folder, cakupan));
	},

	findById(id: string): EvidenceFolderEntity | undefined {
		return this.findAll().find((folder) => folder.id === id);
	},

	create(input: {
		cakupan: EvidenceScope;
		nama: string;
		parentId: string | null;
		pembuat: { userId: string; nama: string };
	}): EvidenceFolderEntity {
		const folder: EvidenceFolderEntity = {
			id: idFolderBaru(),
			ownerTipe: input.cakupan.ownerTipe,
			tenantId: input.cakupan.tenantId,
			studyProgramId: input.cakupan.studyProgramId,
			nama: input.nama.trim(),
			parentId: input.parentId,
			dibuatOlehUserId: input.pembuat.userId,
			dibuatOlehNama: input.pembuat.nama,
			waktuDibuat: new Date().toISOString(),
		};

		this.save([...this.findAll(), folder]);
		this.notify();
		return folder;
	},

	rename(id: string, nama: string): void {
		this.save(
			this.findAll().map((folder) =>
				folder.id === id ? { ...folder, nama: nama.trim() } : folder,
			),
		);
		this.notify();
	},

	/**
	 * Memindahkan satu folder. `false` bila tujuannya folder itu sendiri atau
	 * salah satu keturunannya.
	 *
	 * Pemilih di UI sudah menyembunyikan cabang itu, jadi penolakan di sini adalah
	 * lapis kedua — tapi ia yang benar-benar menahan: pohon yang berputar membuat
	 * seluruh cabangnya hilang dari daftar mana pun, dan tidak ada satu pun jalan
	 * di UI untuk memulihkannya.
	 */
	moveFolder(id: string, tujuanId: string | null): boolean {
		const semua = this.findAll();
		if (tujuanId !== null && keturunanIds(semua, id).has(tujuanId)) {
			return false;
		}

		this.save(
			semua.map((folder) =>
				folder.id === id ? { ...folder, parentId: tujuanId } : folder,
			),
		);
		this.notify();
		return true;
	},

	/**
	 * Membuang baris folder tanpa menyentuh berkas di dalamnya.
	 *
	 * Sengaja tidak bernama `delete`: yang memanggilnya adalah hapus berantai di
	 * `evidence.repository`, yang sudah membuang berkasnya lebih dulu. Dipakai
	 * langsung dari UI, ia akan meninggalkan berkas yang `folderId`-nya menunjuk
	 * folder yang tidak ada lagi.
	 */
	removeMany(ids: Set<string>): void {
		this.save(this.findAll().filter((folder) => !ids.has(folder.id)));
		this.notify();
	},

	/**
	 * Menelusuri — dan membuat yang belum ada — beberapa jalur folder sekaligus,
	 * mengembalikan peta `segments.join('/')` → id folder terdalam.
	 *
	 * **Kenapa jamak, dan kenapa sebelum batch unggah dimulai.** Satu unggahan
	 * folder membawa banyak jalur yang beririsan (`Kriteria 4/SK/a.pdf` dan
	 * `Kriteria 4/b.docx` berbagi tingkat pertama). Kalau tiap berkas
	 * menyelesaikan jalurnya sendiri saat unggahannya jalan, dua berkas dalam satu
	 * folder akan berlomba membuat folder yang sama dua kali. Versi jamak ini
	 * membaca sekali, menulis sekali, dan memancarkan satu `storage-update`.
	 *
	 * **Nama yang sama dipakai ulang, tidak diduplikasi** (tanpa peduli besar-kecil
	 * huruf). Berbeda dari Google Drive yang memang menduplikasi — di sini
	 * mengunggah ulang `Kriteria 4/` yang sudah ada jauh lebih sering berarti
	 * "tambahkan isinya" daripada "buatkan folder kembar".
	 */
	ensureFolderPaths(input: {
		cakupan: EvidenceScope;
		parentId: string | null;
		daftarJalur: string[][];
		pembuat: { userId: string; nama: string };
	}): Map<string, string | null> {
		const semua = this.findAll();
		const cakupanIni = semua.filter((folder) =>
			dalamCakupan(folder, input.cakupan),
		);
		const baru: EvidenceFolderEntity[] = [];
		const hasil = new Map<string, string | null>();

		for (const segmen of input.daftarJalur) {
			let indukSekarang = input.parentId;

			for (const nama of segmen) {
				const bersih = nama.trim();
				if (bersih === '') continue;

				const kandidat = [...cakupanIni, ...baru];
				const sudahAda = folderAnak(kandidat, indukSekarang).find(
					(folder) => folder.nama.toLowerCase() === bersih.toLowerCase(),
				);

				if (sudahAda) {
					indukSekarang = sudahAda.id;
					continue;
				}

				const folder: EvidenceFolderEntity = {
					id: idFolderBaru(),
					ownerTipe: input.cakupan.ownerTipe,
					tenantId: input.cakupan.tenantId,
					studyProgramId: input.cakupan.studyProgramId,
					nama: bersih,
					parentId: indukSekarang,
					dibuatOlehUserId: input.pembuat.userId,
					dibuatOlehNama: input.pembuat.nama,
					waktuDibuat: new Date().toISOString(),
				};
				baru.push(folder);
				indukSekarang = folder.id;
			}

			hasil.set(segmen.join('/'), indukSekarang);
		}

		if (baru.length > 0) {
			this.save([...semua, ...baru]);
			this.notify();
		}

		return hasil;
	},
};
