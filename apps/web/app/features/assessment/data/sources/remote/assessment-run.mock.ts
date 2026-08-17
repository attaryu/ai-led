import {
	delay,
	nilaiKriteria,
	sidikJari,
} from '~/features/chapter/data/sources/remote/chapter-scoring.mock';
import { type RubricScoreType } from '~/features/chapter/domain/entities/rubric-criterion.entity';

/**
 * Tiruan sisi jaringan untuk Penilaian AMI.
 *
 * Ini **satu-satunya berkas yang perlu diganti** saat backend siap, mengikuti
 * kebiasaan `chapter-scoring.mock.ts` dan `evidence-upload.mock.ts`. Yang asli
 * ada dan sudah berjalan: `apps/ai` adalah FastAPI "AMI Assessment API" dengan
 * satu agen LangGraph per indikator, `POST /assessment/start` lalu polling
 * `GET /assessment/{id}/status`, paralelisme dijaga `asyncio.Semaphore`.
 *
 * Yang ditiru di sini **hanya bentuk hasilnya dan sifat bertahapnya** — bukan
 * paralelismenya. Progres yang bergerak indikator demi indikator sudah cukup
 * untuk membuat panel progres dan penanganan sesi `RUNNING` benar; berapa banyak
 * yang berjalan serempak tidak terlihat dari sisi ini sama sekali.
 *
 * **Mesin skornya bukan milik berkas ini.** Ia memanggil `nilaiKriteria()` dari
 * mock skor bab — alasannya ditulis di sana: tab Rubrik dan Penilaian AMI
 * menjawab pertanyaan yang sama atas tulisan yang sama, jadi dua penilai
 * terpisah hanya akan menghasilkan dua angka yang selisihnya tidak bisa
 * dijelaskan kepada siapa pun.
 */

/** Jeda per indikator. Cukup untuk melihat progres bergerak, cukup pendek untuk dites. */
export const ASSESSMENT_STEP_MS = 220;

export type RunAssessmentKriteria = {
	no: number;
	kodeKriteria: string;
	skorMaksimal: number;
	tipeSkor: RubricScoreType;
};

export type RunIndicatorResult = {
	indikatorNo: number;
	skor: number | null;
	justifikasi: string;
	confidence: number | null;
	rekomendasi: string | null;
	error: string | null;
};

export type RunAssessmentInput = {
	/** Gabungan tulisan LED yang dinilai. */
	konten: string;
	kriteria: RunAssessmentKriteria[];
	/** Dipanggil tiap satu indikator selesai, untuk menggerakkan progres. */
	onIndicator?: (hasil: RunIndicatorResult, selesai: number) => void;
};

/**
 * Keyakinan penilai, deterministik dari sidik jari isi.
 *
 * Indikator kuantitatif diberi keyakinan lebih tinggi daripada kualitatif, dan
 * itu bukan hiasan: yang kuantitatif dihitung dengan rumus atas tabel LKPS,
 * sedangkan yang kualitatif adalah pertimbangan model atas narasi. Selisih itu
 * nyata, dan menampilkannya rata akan menyembunyikan justru baris-baris yang
 * paling perlu dibaca ulang manusia.
 */
function hitungConfidence(kunci: string, tipeSkor: RubricScoreType): number {
	const dasar = 0.45 + (sidikJari(kunci) % 46) / 100;
	const penyesuaian =
		tipeSkor === 'kuantitatif' ? 0.1 : tipeSkor === 'komposit' ? 0.02 : -0.06;
	return Math.round(Math.min(0.98, Math.max(0.2, dasar + penyesuaian)) * 100) / 100;
}

/**
 * Saran perbaikan, atau `null` bila memang tidak ada yang perlu disarankan.
 *
 * Skor penuh sengaja **tidak** diberi rekomendasi berbunyi "pertahankan": kolom
 * yang selalu terisi berhenti menandakan apa pun, dan pembaca kehilangan cara
 * memindai mana yang benar-benar menuntut tindakan. Kolomnya kosong justru itu
 * informasinya.
 */
function rekomendasiUntuk(
	skor: number,
	skorMaksimalKriteria: number,
	tipeSkor: RubricScoreType,
): string | null {
	if (skor >= skorMaksimalKriteria) return null;

	if (tipeSkor === 'kuantitatif') {
		return 'Angkanya berasal dari tabel LKPS, jadi menambah narasi tidak akan menaikkannya. Perbaiki datanya di LKPS, atau lampirkan penjelasan bila angkanya memang sudah benar.';
	}

	switch (skor) {
		case 0:
			return 'Belum ada uraian untuk indikator ini. Tambahkan pembahasannya di bab yang bersangkutan sebelum penilaian berikutnya.';
		case 1:
			return 'Uraiannya belum menjawab yang ditanyakan indikator. Sesuaikan isinya dengan bunyi kriteria, jangan sekadar menyinggung topiknya.';
		case 2:
			return 'Lampirkan bukti dukung dan sebutkan angkanya di dalam narasi — uraian yang tidak bisa ditelusuri berhenti di skor ini.';
		default:
			return 'Tambahkan analisis atas kondisi yang diuraikan beserta rencana tindak lanjut yang terukur.';
	}
}

/**
 * Menilai satu indikator — bagian yang **tidak** menyangkut waktu.
 *
 * Dipisah dari {@link runAssessment} supaya seed contoh di repository bisa
 * memakai penilai yang sama persis tanpa menunggu jeda per indikator. Versi
 * pertama berkas ini membiarkan seed menghitung keyakinannya sendiri dengan
 * rumus lain, dan akibatnya terlihat begitu dicoba: menekan "Nilai Ulang" tanpa
 * menyunting apa pun menggeser jumlah "perlu ditinjau" dari empat jadi satu.
 * Angkanya tidak salah — yang salah adalah dua penilai berbeda untuk pertanyaan
 * yang sama.
 */
export function nilaiIndikator(
	konten: string,
	kriteria: RunAssessmentKriteria,
): RunIndicatorResult {
	const dinilai = nilaiKriteria(
		konten,
		kriteria.kodeKriteria,
		kriteria.skorMaksimal,
	);

	return {
		indikatorNo: kriteria.no,
		skor: dinilai.skorDidapat,
		justifikasi: dinilai.justifikasi,
		confidence: hitungConfidence(
			`${kriteria.no}:${kriteria.kodeKriteria}:${konten}`,
			kriteria.tipeSkor,
		),
		rekomendasi: rekomendasiUntuk(
			dinilai.skorDidapat,
			kriteria.skorMaksimal,
			kriteria.tipeSkor,
		),
		error: null,
	};
}

/**
 * Menjalankan penilaian atas seluruh indikator, satu per satu.
 *
 * Mengembalikan seluruh hasilnya sekaligus **dan** melaporkan tiap indikator
 * lewat `onIndicator`: yang pertama dipakai repository untuk menyimpan, yang
 * kedua dipakai tampilan untuk bergerak. Tanpa keduanya, progres hanya akan
 * melompat dari 0 ke 100 di akhir.
 */
export async function runAssessment(
	input: RunAssessmentInput,
): Promise<RunIndicatorResult[]> {
	const hasil: RunIndicatorResult[] = [];

	for (const kriteria of input.kriteria) {
		await delay(ASSESSMENT_STEP_MS);

		const baris = nilaiIndikator(input.konten, kriteria);
		hasil.push(baris);
		input.onIndicator?.(baris, hasil.length);
	}

	return hasil;
}

/**
 * Isi tiruan untuk dokumen yang dinilai dari **unggahan PDF**, bukan dari editor.
 *
 * Yang asli mengekstrak teks PDF-nya lalu mengindeksnya ke ChromaDB
 * (`POST /upload/led` di `apps/ai`). Di sini tidak ada teks untuk diekstrak, jadi
 * yang dibangkitkan sekadar penopang supaya penilaian tetap **deterministik per
 * berkas**: berkas dengan nama sama selalu memberi skor sama, berkas berbeda
 * memberi skor berbeda. Itu janji minimum yang harus tetap berlaku agar penanda
 * "koreksi ini basi" tidak menyala palsu.
 */
export function kontenTiruanDariBerkas(namaBerkas: string): string {
	const panjang = 400 + (sidikJari(namaBerkas) % 900);
	return `Uraian hasil ekstraksi ${namaBerkas}. `.repeat(
		Math.max(1, Math.round(panjang / 40)),
	);
}
