import { z } from 'zod';

import { daysUntil } from '~/core/lib/format-time';

export const ledProjectStatusEnum = z.enum(['DRAFT', 'REVIEW', 'SELESAI']);
export type LedProjectStatus = z.infer<typeof ledProjectStatusEnum>;

export const ledProjectSchema = z.object({
	id: z.string(),
	studyProgramId: z.string().min(1, 'Program studi wajib dipilih'),
	studyProgramName: z.string().min(1, 'Nama program studi wajib diisi'),
	judul: z.string().min(1, 'Judul proyek wajib diisi').max(200, 'Judul proyek maksimal 200 karakter'),
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
	 * tahunan dan tidak berubah tiap siklus, sedangkan yang mendorong kerja
	 * sehari-hari adalah target penyelesaian dokumen yang sedang berjalan.
	 */
	tenggat: z.string().nullable(),
	createdAt: z.string(),
});

export type LedProjectEntity = z.infer<typeof ledProjectSchema>;

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

export type ProgramCycles = {
	/**
	 * Dokumen yang sedang dikerjakan prodi ini. `null` bila prodi belum punya
	 * dokumen sama sekali, atau bila seluruh dokumennya sudah `SELESAI`.
	 */
	aktif: LedProjectEntity | null;
	/** Sisanya, terbaru di atas. Termasuk siklus yang sudah `SELESAI`. */
	arsip: LedProjectEntity[];
};

/**
 * Memilah dokumen satu prodi jadi "yang sedang berjalan" dan "arsip".
 *
 * Akreditasi LAM Teknik berjalan satu siklus pada satu waktu, jadi menampilkan
 * seluruh dokumen sebagai kartu sederajat memodelkan dunia yang salah. Siklus
 * aktif = dokumen belum `SELESAI` dengan tahun akademik terbesar.
 *
 * Ini turunan, bukan kolom `is_aktif` (docs/application_flow.md §5.1e): kolom
 * tersendiri akan jadi sumber kebenaran kedua yang bisa tidak sinkron dengan
 * `status_keseluruhan` — dokumen bisa saja ditandai aktif padahal statusnya
 * sudah `SELESAI`.
 */
export function pickSiklusAktif(projects: LedProjectEntity[]): ProgramCycles {
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
