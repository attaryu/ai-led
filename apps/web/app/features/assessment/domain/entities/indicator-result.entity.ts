import { z } from 'zod';

/**
 * Hasil AI untuk satu indikator pada satu sesi penilaian
 * (docs/database.md → `IndicatorResult`).
 *
 * **Kebijakannya main timpa**, sama seperti `kontenKerja` dan
 * `HasilSkorKriteria.replaceForTarget`: menjalankan penilaian ulang untuk sesi
 * yang sama mengganti barisnya. Itulah persis alasan koreksi Penjamin Mutu
 * **tidak** boleh disimpan di sini melainkan di
 * {@link ../entities/assessment-override.entity AssessmentOverrideEntity} —
 * kalau ditulis ke kolom yang sama, satu klik "Nilai Ulang" menghapus keputusan
 * manusia tanpa meninggalkan jejak.
 */
export const indicatorResultSchema = z.object({
	id: z.string(),
	sesiId: z.string(),
	/** Nomor indikator di matriks; kunci ke `RubricCriterion.no`. */
	indikatorNo: z.number().int().positive(),
	/**
	 * Skor 0–4. **Bukan bilangan bulat**: `IndicatorResult.score` di Prisma
	 * bertipe `Decimal(5,2)` karena indikator komposit dihitung lewat rumus
	 * seperti `((I x 2) + II) / 3` yang jarang jatuh tepat di bilangan bulat.
	 *
	 * `null` berarti indikator ini gagal dinilai — dibedakan dari skor 0 yang
	 * merupakan vonis sungguhan bahwa tidak ada uraian sama sekali.
	 */
	skor: z.number().nullable(),
	/** Alasan AI memberi skor segitu; kosong bila penilainya tidak menjelaskan. */
	justifikasi: z.string(),
	/**
	 * Seberapa yakin penilai pada angkanya, 0–1. `null` bila tidak dilaporkan.
	 *
	 * Gunanya menemukan mana yang butuh mata manusia, bukan memberi peringkat —
	 * lihat {@link tingkatConfidence}.
	 */
	confidence: z.number().min(0).max(1).nullable(),
	/** Saran perbaikan; `null` bila penilai tidak punya saran. */
	rekomendasi: z.string().nullable(),
	/** Terisi bila indikator ini gagal dinilai; `skor` ikut `null`. */
	error: z.string().nullable(),
	dinilaiPada: z.string(),
});

export type IndicatorResultEntity = z.infer<typeof indicatorResultSchema>;

/**
 * Tiga tingkat keyakinan.
 *
 * Angkanya sendiri tidak ditampilkan telanjang di tabel: 78 desimal berjajar
 * tidak bisa dibaca, dan yang sebenarnya ditanyakan pembaca bukan "berapa
 * persisnya" melainkan "yang mana yang harus saya periksa". Angka aslinya tetap
 * ada di tooltip untuk yang membutuhkannya.
 */
export const confidenceLevelEnum = z.enum(['TINGGI', 'SEDANG', 'RENDAH']);
export type ConfidenceLevel = z.infer<typeof confidenceLevelEnum>;

export const CONFIDENCE_TINGGI = 0.8;
export const CONFIDENCE_SEDANG = 0.5;

export function tingkatConfidence(nilai: number): ConfidenceLevel {
	if (nilai >= CONFIDENCE_TINGGI) return 'TINGGI';
	if (nilai >= CONFIDENCE_SEDANG) return 'SEDANG';
	return 'RENDAH';
}

export const confidenceLabels: Record<ConfidenceLevel, string> = {
	TINGGI: 'Tinggi',
	SEDANG: 'Sedang',
	RENDAH: 'Rendah',
};

/**
 * Skor di bawah ambang ini dianggap temuan yang patut diperiksa manusia.
 *
 * Namanya menyebut "diperiksa", bukan "ditinjau", dan itu penting: "ditinjau"
 * sudah dipakai untuk status pekerjaan Penjamin Mutu (sudah dilihat atau belum).
 * Yang ini dugaan AI tentang angkanya — dua hal yang bisa berlawanan, dan dua
 * nama mirip untuk keduanya membuat layar tidak bisa dibaca.
 */
export const SKOR_PERLU_DIPERIKSA = 2;
