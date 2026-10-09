import { z } from 'zod';

/**
 * Level kepemilikan bukti dukung (docs/database.md → BUKTI_DUKUNG.owner_tipe).
 *
 * `TENANT` berlaku lintas prodi (Statuta, Renstra Universitas), `PROGRAM_STUDI`
 * hanya milik satu prodi. Keduanya tidak pernah terikat ke satu Dokumen LED,
 * jadi bukti dukung prodi otomatis tersedia untuk semua dokumen prodi itu (§5.2).
 */
export const evidenceOwnerTypeEnum = z.enum(['TENANT', 'PROGRAM_STUDI']);
export type EvidenceOwnerType = z.infer<typeof evidenceOwnerTypeEnum>;

/**
 * Status pipeline ekstraksi/ingestion (PRD §3.3).
 *
 * Berkas baru selesai diunggah masuk `MENUNGGU`; isinya baru bisa dipakai
 * sebagai konteks AI setelah `SIAP`. `GAGAL` bisa dicoba ulang.
 */
export const evidenceStatusEnum = z.enum([
	'MENUNGGU',
	'DIPROSES',
	'SIAP',
	'GAGAL',
]);
export type EvidenceStatus = z.infer<typeof evidenceStatusEnum>;

export const evidenceSchema = z.object({
	id: z.string(),
	ownerTipe: evidenceOwnerTypeEnum,
	/** Terisi bila `ownerTipe = TENANT`. */
	tenantId: z.string().nullable(),
	/** Terisi bila `ownerTipe = PROGRAM_STUDI`. */
	studyProgramId: z.string().nullable(),
	/**
	 * Disalin saat unggah supaya daftar tidak perlu join ke prodi tiap render.
	 * Nanti diisi backend lewat join; di sini disimpan ikut barisnya.
	 */
	studyProgramName: z.string().nullable(),
	/**
	 * Folder tempat berkas ini berada; `null` = akar cakupannya
	 * (docs/application_flow.md §4.6a). Padanan `BUKTI_DUKUNG.folder_id`.
	 *
	 * Foldernya sendiri hidup di koleksi terpisah — alasannya panjang dan ditulis
	 * di kepala {@link ./evidence-folder.entity evidence-folder.entity.ts}, karena
	 * ia yang menentukan bentuk seluruh fitur folder.
	 *
	 * **Kolom ini lebih muda dari data yang sudah tersimpan.** Baris `evidence_data`
	 * yang ditulis sebelum folder ada tidak memuatnya, dan `findAll` mem-`JSON.parse`
	 * tanpa lewat zod — jadi tidak ada galat, yang ada `undefined` menyusup ke
	 * tempat yang mengharap `string | null`. Ditolong satu normalisasi di
	 * `evidenceRepository.findAll`, bukan migrasi.
	 */
	folderId: z.string().nullable(),
	namaDokumen: z
		.string()
		.min(1, 'Nama dokumen wajib diisi')
		.max(255, 'Nama dokumen maksimal 255 karakter'),
	/** Object key di R2, bukan URL publik — tautan unduh dibuat saat dibutuhkan. */
	fileUrl: z.string(),
	tipeFile: z.string(),
	ukuranBytes: z.number().int().nonnegative(),
	status: evidenceStatusEnum,
	/** Alasan singkat saat `status = GAGAL`, ditampilkan di panel detail. */
	catatanGagal: z.string().nullable(),
	/**
	 * Tahun / periode data, teks bebas (mis. "2024/2025"). Hanya LKPS yang memakainya --
	 * Bukti Dukung dan LKPS lama selalu `null`. Pembeda utama beberapa LKPS dalam satu
	 * prodi saat dipilih untuk sebuah Dokumen LED.
	 */
	periode: z.string().nullable(),
	uploadedByUserId: z.string(),
	uploadedByName: z.string(),
	waktuDiunggah: z.string(),
});

export type EvidenceEntity = z.infer<typeof evidenceSchema>;

export type EvidenceSummary = {
	total: number;
	menunggu: number;
	diproses: number;
	siap: number;
	gagal: number;
	/** 0–100, dibulatkan. 0 bila belum ada berkas sama sekali. */
	persenSiap: number;
	/** ISO unggahan terbaru; `null` bila belum ada berkas. */
	terakhirDiunggah: string | null;
	/** Nama berkas pemilik `terakhirDiunggah`. */
	berkasTerakhir: string | null;
};

/**
 * Satu kali lintasan untuk seluruh angka kesiapan bukti dukung. Ditaruh di
 * domain (bukan di komponen) dengan alasan yang sama seperti `summarizeChapters`
 * di fitur chapter: Dashboard Prodi dan dashboard agregat institusi nanti
 * memakainya ulang tanpa menyalin aturan hitungnya.
 *
 * "Siap" adalah ukuran yang berarti di sini karena hanya berkas `SIAP` yang
 * isinya bisa dipakai sebagai konteks AI (PRD §3.3) — sisanya baru berupa
 * berkas yang tersimpan.
 */
export function summarizeEvidence(evidences: EvidenceEntity[]): EvidenceSummary {
	let menunggu = 0;
	let diproses = 0;
	let siap = 0;
	let gagal = 0;
	let terakhirDiunggah: string | null = null;
	let berkasTerakhir: string | null = null;

	for (const evidence of evidences) {
		switch (evidence.status) {
			case 'MENUNGGU':
				menunggu += 1;
				break;
			case 'DIPROSES':
				diproses += 1;
				break;
			case 'SIAP':
				siap += 1;
				break;
			case 'GAGAL':
				gagal += 1;
				break;
		}

		if (
			terakhirDiunggah === null ||
			evidence.waktuDiunggah > terakhirDiunggah
		) {
			terakhirDiunggah = evidence.waktuDiunggah;
			berkasTerakhir = evidence.namaDokumen;
		}
	}

	const total = evidences.length;

	return {
		total,
		menunggu,
		diproses,
		siap,
		gagal,
		persenSiap: total === 0 ? 0 : Math.round((siap / total) * 100),
		terakhirDiunggah,
		berkasTerakhir,
	};
}

/**
 * Tipe berkas yang diterima (PRD §3.2): PDF, Word, Excel, dan hasil scan.
 * Dicocokkan lewat ekstensi karena `File.type` tidak konsisten antar sistem
 * operasi untuk .docx/.xlsx.
 */
export const EVIDENCE_ACCEPTED_EXTENSIONS = [
	'pdf',
	'doc',
	'docx',
	'xls',
	'xlsx',
	'jpg',
	'jpeg',
	'png',
] as const;

/** Nilai untuk atribut `accept` pada `<input type="file">`. */
export const EVIDENCE_ACCEPT_ATTRIBUTE = EVIDENCE_ACCEPTED_EXTENSIONS.map(
	(extension) => `.${extension}`,
).join(',');

export const EVIDENCE_MAX_SIZE_BYTES = 25 * 1024 * 1024;

export const EVIDENCE_VALIDATION_MESSAGES = {
	tipeTidakDidukung: `Tipe berkas tidak didukung. Gunakan ${EVIDENCE_ACCEPTED_EXTENSIONS.join(', ')}.`,
	ukuranTerlaluBesar: 'Ukuran berkas melebihi batas 25 MB.',
	berkasKosong: 'Berkas kosong (0 byte).',
} as const;

/** Ekstensi huruf kecil tanpa titik; string kosong bila tidak ada ekstensi. */
export function getEvidenceExtension(fileName: string): string {
	const lastDot = fileName.lastIndexOf('.');
	if (lastDot === -1 || lastDot === fileName.length - 1) return '';
	return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Validasi satu berkas sebelum masuk antrean unggah. Dikembalikan sebagai pesan
 * (bukan throw) supaya satu berkas bermasalah tidak menggugurkan satu batch.
 */
export function validateEvidenceFile(file: {
	name: string;
	size: number;
}): string | null {
	const extension = getEvidenceExtension(file.name);
	if (
		!EVIDENCE_ACCEPTED_EXTENSIONS.includes(
			extension as (typeof EVIDENCE_ACCEPTED_EXTENSIONS)[number],
		)
	) {
		return EVIDENCE_VALIDATION_MESSAGES.tipeTidakDidukung;
	}
	if (file.size === 0) return EVIDENCE_VALIDATION_MESSAGES.berkasKosong;
	if (file.size > EVIDENCE_MAX_SIZE_BYTES) {
		return EVIDENCE_VALIDATION_MESSAGES.ukuranTerlaluBesar;
	}
	return null;
}
