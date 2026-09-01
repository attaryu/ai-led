import { z } from 'zod';

import { rubricCriterionSchema } from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { evidenceStatusEnum } from '~/features/evidence/domain/entities/evidence.entity';

/**
 * Dua jenis berkas acuan dalam satu set, mengikuti `TipePanduan` di
 * docs/database.md → PANDUAN_REFERENSI (yang punya nilai ketiga,
 * `TEMPLATE_LKPS` — sengaja tidak dipakai di sini, Set Akreditasi cukup
 * Matriks Penilaian + Pedoman Penyusunan). Keduanya menjawab pertanyaan yang
 * sama — menilai ke lembaga mana, siklus kapan — sehingga selalu dipilih
 * sebagai satu paket, bukan satu per satu.
 */
export const setDocumentTypeEnum = z.enum([
	'DOKUMEN_RUBRIK',
	'PANDUAN_LAM',
]);
export type SetDocumentType = z.infer<typeof setDocumentTypeEnum>;

export const SET_DOCUMENT_TYPE_LABEL: Record<SetDocumentType, string> = {
	DOKUMEN_RUBRIK: 'Matriks Penilaian',
	PANDUAN_LAM: 'Pedoman Penyusunan',
};

/**
 * Urutan slot di layar, sekaligus satu-satunya sumber kebenaran bahwa slotnya
 * ada dua. Tampilan mengulang daftar ini alih-alih menulis tiap slot satu
 * per satu, supaya penambahan jenis berkas cukup disentuh di sini.
 */
export const SET_DOCUMENT_TYPES = setDocumentTypeEnum.options;

/**
 * `DRAF` berarti isinya belum ditinjau, jadi belum boleh dipilih proyek mana
 * pun. `SIAP` mengunci isinya — lihat catatan pada `accreditationSetSchema`.
 */
export const setStatusEnum = z.enum(['DRAF', 'SIAP']);
export type SetStatus = z.infer<typeof setStatusEnum>;

export const SET_STATUS_LABEL: Record<SetStatus, string> = {
	DRAF: 'Draf',
	SIAP: 'Siap',
};

export const accreditationSetDocumentSchema = z.object({
	tipe: setDocumentTypeEnum,
	namaBerkas: z.string(),
	/** Ekstensi tanpa titik, misal `pdf`. Dipakai untuk ikon dan penyaringan. */
	tipeBerkas: z.string(),
	ukuranBytes: z.number(),
	diunggahPada: z.string(),
	diunggahOleh: z.string(),
});

export type AccreditationSetDocument = z.infer<
	typeof accreditationSetDocumentSchema
>;

/**
 * Satu paket acuan penilaian — rubrik, panduan, dan template dari satu lembaga
 * untuk satu siklus akreditasi.
 *
 * Set disimpan di tingkat tenant tapi dipilih per proyek Dokumen LED, karena
 * satu universitas bisa punya prodi di bawah lembaga penilai yang berbeda, dan
 * dokumen dari siklus berbeda dinilai dengan rubrik yang berbeda pula.
 *
 * Set yang sudah dipakai proyek tidak boleh diubah isinya: hasil penilaian
 * menunjuk ke kriteria, sehingga kriteria yang berubah diam-diam mengubah arti
 * skor yang sudah tersimpan. Perubahan dilakukan dengan menduplikasi set jadi
 * versi baru, bukan menyunting yang lama.
 */
export const accreditationSetSchema = z.object({
	id: z.string(),
	nama: z
		.string()
		.min(1, 'Nama set wajib diisi')
		.max(100, 'Nama set maksimal 100 karakter'),
	/** Teks bebas, bukan enum: lembaga penilai baru bisa muncul kapan saja. */
	lembaga: z
		.string()
		.min(1, 'Lembaga penilai wajib diisi')
		.max(100, 'Lembaga penilai maksimal 100 karakter'),
	tahunSiklus: z
		.number({ message: 'Tahun siklus wajib diisi' })
		.int('Tahun siklus harus bilangan bulat')
		.min(2000, 'Tahun siklus minimal 2000')
		.max(2100, 'Tahun siklus maksimal 2100'),
	status: setStatusEnum,
	dokumen: z.array(accreditationSetDocumentSchema),
	/**
	 * Isi rubrik yang berlaku untuk set ini — hasil pembacaan berkas
	 * `DOKUMEN_RUBRIK`, sementara ini dimasukkan manual lewat layar tinjau.
	 *
	 * **Disimpan di dalam set, bukan sebagai daftar tersendiri.** Kriteria tidak
	 * punya arti di luar set yang memayunginya: mengunci set berarti mengunci
	 * kriterianya, dan menduplikasi set jadi versi baru berarti menyalin satu
	 * objek utuh. Penyimpanan terpisah hanya menambah satu daftar yang bisa
	 * yatim saat setnya hilang.
	 *
	 * Bentuk tiap barisnya dipinjam dari `rubric-criterion.entity.ts` — sengaja
	 * bukan salinan. Berkas itu masih memegang katalog global `RUBRIK_KRITERIA`
	 * yang dibaca Penilaian AMI dan Editor Bab; yang berpindah ke sini nanti
	 * adalah sumber datanya, bukan bentuknya.
	 */
	kriteria: z.array(rubricCriterionSchema),
	/**
	 * Status ekstraksi otomatis kriteria dari berkas DOKUMEN_RUBRIK terakhir
	 * yang diunggah (worker.py::_handle_ingestion_rubrik_dokumen). Sama
	 * enumnya dengan status ekstraksi bukti dukung — dua pipeline berbeda,
	 * satu kosakata status, satu badge (`EvidenceStatusBadge`) dipakai ulang.
	 */
	criteriaParseStatus: evidenceStatusEnum,
	criteriaParseError: z.string().nullable(),
	/** Status ekstraksi struktur bab/sub-bab dari PANDUAN_LAM terakhir yang diunggah — worker.py::_handle_ingestion_struktur_dokumen. */
	structureParseStatus: evidenceStatusEnum,
	structureParseError: z.string().nullable(),
	createdAt: z.string(),
});

export type AccreditationSetEntity = z.infer<typeof accreditationSetSchema>;

export type SetCompleteness = {
	/** Jenis berkas yang sudah terisi, urut mengikuti `SET_DOCUMENT_TYPES`. */
	terisi: SetDocumentType[];
	kosong: SetDocumentType[];
	lengkap: boolean;
};

/**
 * Kelengkapan berkas satu set. Turunan, bukan kolom — alasannya sama dengan
 * masa berlaku akreditasi di `study-program.entity.ts`: menyimpannya berarti
 * ada nilai kedua yang harus dijaga sinkron dengan daftar berkasnya, dan begitu
 * ada satu jalur unggah yang lupa memperbaruinya, daftar mulai berbohong.
 */
export function deriveSetCompleteness(
	set: AccreditationSetEntity,
): SetCompleteness {
	const terisi = SET_DOCUMENT_TYPES.filter((tipe) =>
		set.dokumen.some((d) => d.tipe === tipe),
	);
	const kosong = SET_DOCUMENT_TYPES.filter((tipe) => !terisi.includes(tipe));

	return { terisi, kosong, lengkap: kosong.length === 0 };
}

/** Berkas pada satu slot, atau `null` bila slotnya masih kosong. */
export function findSetDocument(
	set: AccreditationSetEntity,
	tipe: SetDocumentType,
): AccreditationSetDocument | null {
	return set.dokumen.find((d) => d.tipe === tipe) ?? null;
}

/**
 * Jumlah kriteria minimum sebelum sebuah set boleh ditandai siap.
 *
 * Satu, bukan angka yang terdengar meyakinkan seperti sepuluh: rubrik pendek
 * yang sah memang ada, dan menolaknya hanya akan memaksa orang mengarang baris
 * kosong supaya lolos. Yang perlu dicegah cuma set kosong yang dipilih proyek
 * lalu menghasilkan penilaian tanpa satu pun indikator.
 */
export const MIN_KRITERIA_SIAP = 1;

/**
 * Apa saja yang masih boleh dilakukan terhadap sebuah set.
 *
 * **Satu kunci, satu pemicu: pemakaian.** Selama belum ada Dokumen LED yang
 * memilih set ini, seluruhnya terbuka — identitas, berkas, maupun isi rubrik.
 * Begitu satu dokumen memakainya, seluruhnya terkunci sekaligus, dan revisi
 * ditempuh dengan menduplikasi jadi versi baru.
 *
 * Sempat ada kunci kedua di status `SIAP`, dan itu keliru. Alasan mengunci
 * kriteria adalah hasil penilaian yang menunjuk kepadanya — padahal skor baru
 * ada sesudah sebuah dokumen memilih set ini dan dinilai. Set siap yang belum
 * dipakai siapa pun tidak punya satu pun skor untuk dilindungi, jadi kunci di
 * sana menjaga sesuatu yang belum ada. Karena kunci itu tidak punya alasan,
 * tidak ada pula dasar memutuskan apa saja yang ikut terkena — dan slot berkas
 * yang masih kosong ikut terkunci, membuat set siap yang berkasnya kurang tidak
 * bisa dilengkapi lagi. Status kini menjadi gerbang, bukan kunci: lihat
 * {@link deriveSetReadiness}.
 */
export type SetLock = {
	/** Identitas, berkas, dan isi rubrik — ketiganya ikut nilai yang sama. */
	terbuka: boolean;
	bolehHapus: boolean;
	/** Alasan penguncian untuk ditampilkan apa adanya; `null` bila tidak terkunci. */
	alasan: string | null;
};

/**
 * `dipakaiProyek` diterima sebagai angka, bukan boolean, karena tampilan perlu
 * menyebut berapa dokumen yang terdampak — "dipakai 3 dokumen" menjelaskan
 * kenapa tombolnya mati, sedangkan "sedang dipakai" hanya menyatakan bahwa ia
 * mati.
 */
export function deriveSetLock(dipakaiProyek: number): SetLock {
	if (dipakaiProyek > 0) {
		return {
			terbuka: false,
			bolehHapus: false,
			alasan: `Set ini sudah dipakai ${dipakaiProyek} Dokumen LED, jadi isinya tidak bisa diubah lagi. Duplikasi setnya kalau acuannya perlu direvisi.`,
		};
	}

	return { terbuka: true, bolehHapus: true, alasan: null };
}

/**
 * Syarat sebuah set boleh berstatus `SIAP`; `null` bila sudah terpenuhi.
 *
 * Dipakai dua arah, dan itu disengaja: sebagai penjaga saat menandai siap, dan
 * sebagai penjaga saat menghapus berkas atau kriteria dari set yang **sudah**
 * siap. Tanpa arah kedua, set siap bisa dikosongkan isinya sesudahnya lalu
 * tetap ditawarkan ke proyek dalam keadaan kosong — gerbang yang bisa dilangkahi
 * dari belakang tidak menjaga apa pun.
 */
export function cekSyaratSiap(set: AccreditationSetEntity): string | null {
	const { kosong } = deriveSetCompleteness(set);

	if (kosong.length > 0) {
		const nama = kosong.map((tipe) => SET_DOCUMENT_TYPE_LABEL[tipe]).join(' dan ');
		return `Set siap harus punya kedua berkas acuan — ${nama} belum ada.`;
	}

	if (set.kriteria.length < MIN_KRITERIA_SIAP) {
		return 'Set siap harus punya isi rubrik — kriteria penilaiannya belum terbaca dari Dokumen Rubrik.';
	}

	return null;
}

export type SetReadiness = {
	boleh: boolean;
	/** Apa yang masih kurang; `null` bila sudah boleh atau sudah berstatus siap. */
	halangan: string | null;
};

/**
 * Apakah set ini boleh ditandai siap, dan kalau belum, apa yang kurang.
 *
 * `SIAP` adalah **gerbang, bukan kunci**: artinya "boleh dipilih Dokumen LED",
 * bukan "tidak boleh diubah". Syaratnya kedua berkas lengkap dan isi rubriknya
 * sudah terbaca, supaya set yang ditawarkan ke proyek selalu set yang utuh —
 * proyek yang memilih set setengah jadi akan mendapati penilaiannya berjalan
 * tanpa acuan lengkap.
 */
export function deriveSetReadiness(set: AccreditationSetEntity): SetReadiness {
	if (set.status === 'SIAP') return { boleh: false, halangan: null };

	const halangan = cekSyaratSiap(set);
	return { boleh: halangan === null, halangan };
}

/**
 * Rentang skor satu set, dari level terendah sampai tertinggi di seluruh
 * kriterianya. `null` bila setnya belum punya kriteria sama sekali.
 *
 * Diturunkan dengan alasan yang sama seperti `skorMaksimal` per kriteria:
 * skalanya sudah tertulis di level tiap kriteria, dan menyimpannya lagi di
 * tingkat set hanya menyediakan satu angka yang bisa berbohong.
 */
export function deriveSetSkorRange(
	set: AccreditationSetEntity,
): { min: number; max: number } | null {
	const semuaSkor = set.kriteria.flatMap((k) => k.levelSkor.map((l) => l.skor));
	if (semuaSkor.length === 0) return null;

	return { min: Math.min(...semuaSkor), max: Math.max(...semuaSkor) };
}

/**
 * Nomor bab yang tidak dinilai satu kriteria pun. Bukan kesalahan — bab
 * pendahuluan dan penutup memang tidak dinilai rubrik (docs/database.md §10) —
 * tapi penyusun berhak tahu bab mana yang tidak akan pernah muncul skornya
 * sebelum setnya dinyatakan siap.
 */
export function findBabTanpaKriteria(
	set: AccreditationSetEntity,
	urutanBabTersedia: number[],
): number[] {
	return urutanBabTersedia.filter(
		(urutan) => !set.kriteria.some((k) => k.urutanBab.includes(urutan)),
	);
}

/** Nama untuk hasil duplikasi, dengan penomoran bila salinannya lebih dari satu. */
export function namaSalinan(
	nama: string,
	namaTerpakai: readonly string[],
): string {
	const dasar = `${nama} (salinan)`;
	if (!namaTerpakai.includes(dasar)) return dasar;

	let urutan = 2;
	while (namaTerpakai.includes(`${dasar} ${urutan}`)) urutan += 1;
	return `${dasar} ${urutan}`;
}
