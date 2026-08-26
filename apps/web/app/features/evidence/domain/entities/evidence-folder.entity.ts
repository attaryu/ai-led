import { z } from 'zod';

import {
	evidenceOwnerTypeEnum,
	type EvidenceEntity,
	type EvidenceOwnerType,
} from './evidence.entity';

/**
 * Folder bukti dukung — padanan tabel `FOLDER_BUKTI`
 * (docs/database.md §7a, docs/application_flow.md §4.6a).
 *
 * **Kenapa koleksi terpisah, bukan baris bertipe di `evidence_data`.** Ini
 * keputusan yang menentukan seluruh bentuk fitur folder, jadi alasannya ditulis
 * di sini alih-alih ditinggalkan untuk ditemukan lagi nanti.
 *
 * Tujuh tempat di luar fitur ini membaca daftar bukti dukung dan menghitung tiap
 * barisnya sebagai berkas — `use-institution-readiness`, `use-program-readiness`,
 * `use-project-progress`, `use-assessment-readiness`, `use-chapter-generation`,
 * `use-chapter-reference`, dan `program-evidence-panel`. Yang paling tegas
 * {@link summarizeEvidence}: ia memasukkan **setiap** baris ke salah satu ember
 * status lalu membaginya jadi `persenSiap`. Folder tidak punya status ekstraksi.
 * Kalau folder ikut jadi baris di koleksi yang sama, satu folder akan terhitung
 * sebagai dokumen yang belum siap dan menarik turun angka kesiapan institusi —
 * kesalahan yang tidak muncul sebagai error, hanya sebagai angka yang salah
 * tanpa ada yang menyadarinya.
 *
 * Koleksi terpisah membuat ketujuh berkas itu tidak berubah sebaris pun, dan itu
 * juga bentuk yang akan dipakai backend: satu tabel `FOLDER_BUKTI` di samping
 * `BUKTI_DUKUNG`, bukan satu tabel bercabang.
 *
 * Pembeda `tipe` tetap ada — tapi di {@link EvidenceNode}, yaitu lapis
 * **tampilan**, tempat daftar memang harus merender dua macam baris berdampingan.
 * Salah di penyimpanan, benar di tampilan; keduanya bukan ketidakkonsistenan.
 *
 * **Cakupan disalin, bukan diciptakan ulang.** `ownerTipe` + `tenantId`/
 * `studyProgramId` bentuknya sama persis dengan `EvidenceEntity`, sehingga tiap
 * cakupan punya pohonnya sendiri dan tidak ada folder yang melintasi batasnya.
 * Bukan penyederhanaan: docs/database.md §7 menetapkan isolasi antar prodi
 * ditegakkan lewat kombinasi kolom itu, dan folder tenant yang memuat berkas
 * prodi akan melubanginya.
 *
 * **Yang sengaja tidak ada:**
 * - `status` apa pun. Yang punya pipeline ekstraksi adalah berkas; folder cuma
 *   tempat. Kabar kegagalan di dalamnya dihitung, bukan disimpan — lihat
 *   {@link hitungIsiFolder}.
 * - `jalur` atau `kedalaman` tersimpan. Keduanya turunan `parentId`, dan
 *   menyimpan turunan berarti memelihara dua sumber kebenaran yang bisa
 *   berselisih: satu pemindahan folder harus menulis ulang seluruh keturunannya.
 * - Tempat sampah. Hapus berarti hilang, sama seperti berkas.
 */
export const EVIDENCE_FOLDER_NAME_MAX = 100;

export const evidenceFolderSchema = z.object({
	id: z.string(),
	ownerTipe: evidenceOwnerTypeEnum,
	/** Terisi bila `ownerTipe = TENANT`. */
	tenantId: z.string().nullable(),
	/** Terisi bila `ownerTipe = PROGRAM_STUDI`. */
	studyProgramId: z.string().nullable(),
	nama: z
		.string()
		.min(1, 'Nama folder wajib diisi')
		.max(
			EVIDENCE_FOLDER_NAME_MAX,
			`Nama folder maksimal ${EVIDENCE_FOLDER_NAME_MAX} karakter`,
		),
	/** `null` = folder ini berada di akar cakupannya. */
	parentId: z.string().nullable(),
	dibuatOlehUserId: z.string(),
	dibuatOlehNama: z.string(),
	waktuDibuat: z.string(),
});

export type EvidenceFolderEntity = z.infer<typeof evidenceFolderSchema>;

/**
 * Satu cakupan perpustakaan: universitas, atau satu prodi.
 *
 * Dijadikan tipe sendiri karena dipakai empat pihak — folder, berkas, query
 * daftar, dan target unggahan — dan menuliskan ketiga kolomnya berulang kali
 * membuat gampang lupa salah satu, yang di sini berarti kebocoran antar prodi.
 */
export type EvidenceScope = {
	ownerTipe: EvidenceOwnerType;
	tenantId: string | null;
	studyProgramId: string | null;
};

/** Apakah satu baris — folder maupun berkas — milik cakupan yang diminta. */
export function dalamCakupan(
	baris: EvidenceScope,
	cakupan: EvidenceScope,
): boolean {
	if (baris.ownerTipe !== cakupan.ownerTipe) return false;
	return cakupan.ownerTipe === 'TENANT'
		? baris.tenantId === cakupan.tenantId
		: baris.studyProgramId === cakupan.studyProgramId;
}

export const EVIDENCE_FOLDER_VALIDATION_MESSAGES = {
	kosong: 'Nama folder wajib diisi',
	terlaluPanjang: `Nama folder maksimal ${EVIDENCE_FOLDER_NAME_MAX} karakter`,
	garisMiring: 'Nama folder tidak boleh memuat garis miring',
	sudahDipakai: 'Sudah ada folder dengan nama ini di lokasi yang sama',
} as const;

/**
 * Validasi nama folder terhadap saudara-saudaranya. Dikembalikan sebagai pesan
 * (bukan throw), mengikuti {@link validateEvidenceFile}.
 *
 * `saudara` harus sudah berisi anak langsung dari induk yang sama saja.
 * `kecualiId` dipakai saat mengganti nama, supaya folder tidak dianggap
 * bertabrakan dengan dirinya sendiri.
 *
 * Garis miring ditolak karena ia satu-satunya pemisah jalur yang dikenali sistem
 * ini; nama yang memuatnya membuat jalur di remah tautan dan di hasil pencarian
 * terbaca seolah ada tingkat yang sebenarnya tidak ada.
 */
export function validateFolderName(
	nama: string,
	saudara: EvidenceFolderEntity[],
	kecualiId?: string,
): string | null {
	const bersih = nama.trim();
	if (bersih === '') return EVIDENCE_FOLDER_VALIDATION_MESSAGES.kosong;
	if (bersih.length > EVIDENCE_FOLDER_NAME_MAX) {
		return EVIDENCE_FOLDER_VALIDATION_MESSAGES.terlaluPanjang;
	}
	if (bersih.includes('/') || bersih.includes('\\')) {
		return EVIDENCE_FOLDER_VALIDATION_MESSAGES.garisMiring;
	}

	const kembar = saudara.some(
		(folder) =>
			folder.id !== kecualiId &&
			folder.nama.toLowerCase() === bersih.toLowerCase(),
	);
	return kembar ? EVIDENCE_FOLDER_VALIDATION_MESSAGES.sudahDipakai : null;
}

/**
 * Anak langsung `parentId`, urut nama. `folders` harus sudah disaring ke satu
 * cakupan — fungsi ini tidak memeriksanya lagi.
 */
export function folderAnak(
	folders: EvidenceFolderEntity[],
	parentId: string | null,
): EvidenceFolderEntity[] {
	return folders
		.filter((folder) => folder.parentId === parentId)
		.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

/**
 * Rantai folder dari akar sampai `id`, dipakai remah tautan dan jalur di hasil
 * pencarian. Larik kosong bila `id` bernilai `null` atau tidak ditemukan.
 *
 * **Berhenti aman pada rantai yang rusak.** `parentId` yang menunjuk folder
 * hilang, atau berputar ke dirinya sendiri, seharusnya tidak pernah terjadi —
 * tapi datanya hidup di localStorage yang bisa disunting tangan, dan penelusuran
 * naik tanpa penjaga akan menggantung tab pengguna alih-alih menampilkan galat.
 */
export function jalurFolder(
	folders: EvidenceFolderEntity[],
	id: string | null,
): EvidenceFolderEntity[] {
	const indeks = new Map(folders.map((folder) => [folder.id, folder]));
	const jalur: EvidenceFolderEntity[] = [];
	const dilewati = new Set<string>();

	let sekarang = id;
	while (sekarang !== null && !dilewati.has(sekarang)) {
		const folder = indeks.get(sekarang);
		if (!folder) break;
		dilewati.add(sekarang);
		jalur.unshift(folder);
		sekarang = folder.parentId;
	}

	return jalur;
}

/** Indeks `parentId` → id anak langsung, dipakai tiga penelusuran di bawah. */
function indeksAnak(folders: EvidenceFolderEntity[]): Map<string, string[]> {
	const anak = new Map<string, string[]>();
	for (const folder of folders) {
		if (folder.parentId === null) continue;
		const daftar = anak.get(folder.parentId);
		if (daftar) daftar.push(folder.id);
		else anak.set(folder.parentId, [folder.id]);
	}
	return anak;
}

/**
 * `id` beserta seluruh keturunannya. Dipakai hapus berantai dan pencegahan
 * siklus saat memindahkan folder.
 */
export function keturunanIds(
	folders: EvidenceFolderEntity[],
	id: string,
): Set<string> {
	const anak = indeksAnak(folders);
	const hasil = new Set<string>([id]);
	const antre = [id];

	while (antre.length > 0) {
		const sekarang = antre.pop() as string;
		for (const anakId of anak.get(sekarang) ?? []) {
			// Penjaga yang sama seperti `jalurFolder`, dengan alasan yang sama: data
			// rusak berhenti lebih awal, tidak menggantung tab.
			if (hasil.has(anakId)) continue;
			hasil.add(anakId);
			antre.push(anakId);
		}
	}

	return hasil;
}

export type IsiFolder = {
	/** Berkas di folder ini **dan seluruh keturunannya**. */
	berkas: number;
	/** Di antaranya, yang berstatus `GAGAL`. */
	perluPerhatian: number;
};

/**
 * Jumlah isi tiap folder dalam satu lintasan, dikunci id folder.
 *
 * **Rekursif, bukan anak langsung.** Folder yang isinya hanya subfolder akan
 * berbunyi "0 berkas" kalau yang dihitung cuma anak langsung — terbaca kosong
 * padahal memuat puluhan berkas, tepat kebalikan dari guna angka itu.
 *
 * **Kenapa `perluPerhatian` ikut dihitung.** Folder menyembunyikan kegagalan.
 * Seluruh guna kolom status adalah menjawab "bukti saya sudah siap belum", dan
 * satu berkas `GAGAL` tiga tingkat di dalam akan lenyap dari pandangan begitu
 * daftarnya bertingkat. Kartu foldernya yang harus mengabarkannya.
 */
export function hitungIsiFolder(
	folders: EvidenceFolderEntity[],
	evidences: EvidenceEntity[],
): Map<string, IsiFolder> {
	const langsung = new Map<string, IsiFolder>();
	for (const evidence of evidences) {
		if (evidence.folderId === null) continue;
		const isi = langsung.get(evidence.folderId) ?? {
			berkas: 0,
			perluPerhatian: 0,
		};
		isi.berkas += 1;
		if (evidence.status === 'GAGAL') isi.perluPerhatian += 1;
		langsung.set(evidence.folderId, isi);
	}

	const anak = indeksAnak(folders);
	const hasil = new Map<string, IsiFolder>();
	const sedangDihitung = new Set<string>();

	const hitung = (id: string): IsiFolder => {
		const sudah = hasil.get(id);
		if (sudah) return sudah;
		// Rantai berputar: kembalikan nol tanpa turun lagi.
		if (sedangDihitung.has(id)) return { berkas: 0, perluPerhatian: 0 };

		sedangDihitung.add(id);
		const sendiri = langsung.get(id);
		const total: IsiFolder = {
			berkas: sendiri?.berkas ?? 0,
			perluPerhatian: sendiri?.perluPerhatian ?? 0,
		};
		for (const anakId of anak.get(id) ?? []) {
			const isi = hitung(anakId);
			total.berkas += isi.berkas;
			total.perluPerhatian += isi.perluPerhatian;
		}
		sedangDihitung.delete(id);

		hasil.set(id, total);
		return total;
	};

	for (const folder of folders) hitung(folder.id);
	return hasil;
}

/**
 * Satu baris daftar perpustakaan — folder atau berkas.
 *
 * Pembeda `tipe` di sini **benar**, walau pembeda yang sama di penyimpanan salah
 * (alasannya di kepala berkas ini): daftar memang harus merender dua macam baris
 * berdampingan, sementara yang dihitung pemakai di luar fitur ini adalah koleksi
 * berkasnya, bukan bentuk tampilan ini.
 *
 * `id` diangkat ke luar supaya kunci render dan kunci seleksi tidak perlu
 * bercabang menurut `tipe` lebih dulu. Id folder berawalan `fld-`, sehingga tidak
 * mungkin bertabrakan dengan id berkas.
 */
export type EvidenceNode =
	| {
			tipe: 'FOLDER';
			id: string;
			folder: EvidenceFolderEntity;
			jumlahBerkas: number;
			jumlahPerluPerhatian: number;
		}
	| {
			tipe: 'BERKAS';
			id: string;
			evidence: EvidenceEntity;
			/**
			 * Nama folder dari akar sampai tempat berkas ini. **Hanya terisi di mode
			 * pencarian**, karena hanya di sana barisnya tercabut dari konteks
			 * foldernya; menghitungnya selalu berarti menaiki pohon untuk tiap baris
			 * di tiap render demi keterangan yang tidak dirender.
			 */
			jalur: string[];
		};
