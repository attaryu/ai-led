import { z } from 'zod';

import { daysUntil } from '~/core/lib/format-time';

export const ledProjectStatusEnum = z.enum(['DRAFT', 'REVIEW', 'SELESAI']);
export type LedProjectStatus = z.infer<typeof ledProjectStatusEnum>;

export const ledProjectSchema = z.object({
	id: z.string(),
	studyProgramId: z.string().min(1, 'Program studi wajib dipilih'),
	studyProgramName: z.string().min(1, 'Nama program studi wajib diisi'),
	judul: z.string().min(1, 'Judul Dokumen LED wajib diisi').max(200, 'Judul Dokumen LED maksimal 200 karakter'),
	/**
	 * Selalu dua tahun berurutan, `YYYY/YYYY`. Tidak pernah diketik utuh oleh
	 * pengguna: formulir meminta satu angka tahun mulai lalu menyusunnya lewat
	 * `susunTahunAkademik`. Regex di bawah karena itu berperan sebagai lapis
	 * kedua — untuk baris lama di localStorage dan untuk data dari API nanti.
	 */
	tahunAkademik: z
		.string()
		.min(1, 'Tahun akademik wajib diisi')
		.regex(/^\d{4}\/\d{4}$/, 'Format tahun akademik harus YYYY/YYYY (contoh: 2025/2026)'),
	statusKeseluruhan: ledProjectStatusEnum,
	/**
	 * Target internal kapan dokumen ini harus selesai (ISO, tanggal saja).
	 * `null` berarti tidak dipatok — bukan berarti tenggatnya hari ini, jadi
	 * tampilan tidak boleh menghitungnya sebagai terlambat.
	 *
	 * Sengaja di dokumen, bukan di prodi: masa berlaku akreditasi prodi jaraknya
	 * tahunan dan tidak berubah tiap penyusunan, sedangkan yang mendorong kerja
	 * sehari-hari adalah target penyelesaian dokumen yang sedang disusun.
	 */
	tenggat: z.string().nullable(),
	/**
	 * Set akreditasi yang jadi acuan penilaian dokumen ini.
	 *
	 * `null` berarti belum dipilih — dokumen masih bisa ditulis, tapi belum bisa
	 * dinilai, karena tidak ada rubrik yang menyatakan apa yang dinilai.
	 *
	 * Ditaruh di dokumen, bukan di prodi maupun tenant: satu universitas bisa
	 * punya prodi di bawah lembaga penilai berbeda, dan dokumen dari siklus
	 * berbeda dinilai dengan rubrik berbeda. Ini juga yang membuat skor lama
	 * tetap bermakna — dokumen selamanya memegang set yang dipakainya, walau
	 * tenant sudah beralih ke set yang lebih baru.
	 */
	accreditationSetId: z.string().nullable(),
	createdAt: z.string(),
});

export type LedProjectEntity = z.infer<typeof ledProjectSchema>;

/**
 * Batas bawah tahun akademik yang boleh dimasukkan lewat formulir.
 *
 * Sengaja angka tetap, bukan hitungan mundur dari tahun berjalan. Batas yang
 * ikut bergeser tiap Januari membuat dokumen lama yang tadinya sah tiba-tiba
 * ditolak — dan yang kena bukan orang yang sedang mengganti tahunnya, melainkan
 * orang yang cuma mengubah tenggat lalu gagal menyimpan gara-gara kolom yang
 * tidak ia sentuh. Siklus akreditasi lima tahunan, jadi 2015 menampung sekitar
 * dua siklus arsip ke belakang sambil tetap menolak salah ketik seperti `225`.
 */
export const TAHUN_AKADEMIK_MIN = 2015;

/**
 * Batas atas: tahun berjalan ditambah satu. LED disusun untuk tahun yang sedang
 * berjalan atau tahun berikutnya; lebih jauh dari itu bukti dukungnya belum ada.
 */
export function tahunAkademikMaks(now: number = Date.now()): number {
	return new Date(now).getFullYear() + 1;
}

/**
 * Menyusun tahun akademik tersimpan dari satu angka tahun mulai.
 *
 * **Asumsi yang ditumpangi seluruh formulir:** tahun akademik selalu dua tahun
 * berurutan (`2025/2026`), tidak pernah `2025/2027`. Karena itu tahun keduanya
 * tidak pernah diketik pengguna, sehingga `2026/2026` dan `2030/2020` bukan
 * ditolak melainkan **tidak mungkin terbentuk** — beda dengan regex pada
 * `ledProjectSchema.tahunAkademik`, yang cuma menjaga bentuk tulisannya.
 *
 * Kalau suatu saat ternyata ada penulisan yang tidak berurutan, di sinilah titik
 * patahnya, dan perbaikannya cukup di formulir: yang tersimpan tetap string
 * `YYYY/YYYY` yang sama, jadi pengurutan, pencarian, dan kop PDF Penilaian AMI
 * tidak ikut tersentuh.
 */
export function susunTahunAkademik(tahunMulai: number): string {
	return `${tahunMulai}/${tahunMulai + 1}`;
}

/**
 * Kebalikan `susunTahunAkademik`, dipakai formulir ubah untuk mengisi kolomnya
 * dari data tersimpan. Mengembalikan string kosong bila nilainya tidak berbentuk
 * `YYYY/YYYY` — kolomnya lalu tampil kosong dan wajib diisi ulang, alih-alih
 * membawa angka karangan yang tampak sah.
 */
export function tahunMulaiDari(tahunAkademik: string): string {
	const cocok = /^(\d{4})\/\d{4}$/.exec(tahunAkademik);
	return cocok ? cocok[1] : '';
}

/**
 * Skema kolom "Tahun Akademik" di formulir — satu angka tahun, bukan
 * `YYYY/YYYY`. Regex pada `ledProjectSchema` tetap dipertahankan sebagai lapis
 * kedua untuk baris lama di localStorage dan untuk data yang nanti datang dari
 * API, bukan dari formulir ini.
 *
 * Rentangnya dibaca sekali saat modul dimuat; tidak ada halaman yang hidup
 * cukup lama untuk melewati pergantian tahun tanpa dimuat ulang.
 */
export const tahunMulaiSchema = z
	.string()
	.min(1, 'Tahun akademik wajib diisi')
	.regex(/^\d{4}$/, 'Isi tahun mulainya saja, empat angka — contoh: 2025')
	.refine(
		(nilai) => {
			const tahun = Number(nilai);
			return tahun >= TAHUN_AKADEMIK_MIN && tahun <= tahunAkademikMaks();
		},
		{
			error: `Tahun harus antara ${TAHUN_AKADEMIK_MIN} dan ${tahunAkademikMaks()}`,
		},
	);

/**
 * Apakah prodi ini sudah punya dokumen LED untuk tahun akademik tersebut.
 *
 * Tidak ada yang menjaganya sebelum ini, dan akibatnya lebih merugikan daripada
 * tahun yang salah bentuk: `pickPenyusunanAktif` memilih satu dokumen dengan
 * tahun terbesar, jadi dokumen kedua bertahun sama tidak akan pernah muncul di
 * Dashboard Prodi — tanpa error dan tanpa tanda apa pun. Bukti dukung dipakai
 * bersama seluruh dokumen milik prodi (docs/application_flow.md §5.3), sehingga
 * tidak ada yang terasa janggal sampai ada yang bertanya kenapa pekerjaannya
 * seperti hilang.
 *
 * Ditegakkan di formulir, bukan di repository, supaya pesannya bisa menempel ke
 * kolom yang salah. `kecualiId` dipakai formulir ubah supaya dokumen tidak
 * bentrok dengan dirinya sendiri.
 */
export function adaTahunAkademikGanda(
	projects: LedProjectEntity[],
	input: { studyProgramId: string; tahunAkademik: string; kecualiId?: string },
): boolean {
	return projects.some(
		(project) =>
			project.id !== input.kecualiId &&
			project.studyProgramId === input.studyProgramId &&
			project.tahunAkademik === input.tahunAkademik,
	);
}

/** Ambang "tenggat sudah dekat" untuk penandaan di Dashboard Prodi. */
export const PROJECT_DEADLINE_SOON_DAYS = 30;

export const deadlineUrgencyEnum = z.enum(['AMAN', 'DEKAT', 'LEWAT']);
export type DeadlineUrgency = z.infer<typeof deadlineUrgencyEnum>;

export type ProjectDeadline = {
	sisaHari: number;
	urgensi: DeadlineUrgency;
};

/** Sisa waktu menuju `tenggat`; `null` bila dokumen tidak dipatok tenggat. */
export function deriveDeadline(
	tenggat: string | null,
	now: number = Date.now(),
): ProjectDeadline | null {
	if (!tenggat) return null;

	const sisaHari = daysUntil(tenggat, now);

	return {
		sisaHari,
		urgensi:
			sisaHari < 0
				? 'LEWAT'
				: sisaHari <= PROJECT_DEADLINE_SOON_DAYS
					? 'DEKAT'
					: 'AMAN',
	};
}

export type ProgramDrafting = {
	/**
	 * Dokumen yang sedang dikerjakan prodi ini. `null` bila prodi belum punya
	 * dokumen sama sekali, atau bila seluruh dokumennya sudah `SELESAI`.
	 */
	aktif: LedProjectEntity | null;
	/** Sisanya, terbaru di atas. Termasuk dokumen yang sudah `SELESAI`. */
	arsip: LedProjectEntity[];
};

/**
 * Memilah dokumen satu prodi jadi "yang sedang disusun" dan "arsip".
 *
 * Akreditasi LAM Teknik berjalan per prodi, satu dokumen pada satu waktu, jadi
 * menampilkan seluruh dokumen sebagai kartu sederajat memodelkan dunia yang
 * salah. Yang sedang disusun = dokumen belum `SELESAI` dengan tahun akademik
 * terbesar.
 *
 * Ini turunan, bukan kolom `is_aktif` (docs/application_flow.md §5.1e): kolom
 * tersendiri akan jadi sumber kebenaran kedua yang bisa tidak sinkron dengan
 * `status_keseluruhan` — dokumen bisa saja ditandai aktif padahal statusnya
 * sudah `SELESAI`.
 */
export function pickPenyusunanAktif(
	projects: LedProjectEntity[],
): ProgramDrafting {
	// Tahun akademik berformat "YYYY/YYYY" sehingga urutan leksikal sama dengan
	// urutan kronologis; `createdAt` jadi pemutus untuk tahun yang sama.
	const terbaruDiAtas = [...projects].sort((a, b) => {
		const tahun = b.tahunAkademik.localeCompare(a.tahunAkademik);
		return tahun !== 0 ? tahun : b.createdAt.localeCompare(a.createdAt);
	});

	const aktif =
		terbaruDiAtas.find((p) => p.statusKeseluruhan !== 'SELESAI') ?? null;

	return {
		aktif,
		arsip: terbaruDiAtas.filter((p) => p.id !== aktif?.id),
	};
}
