import {
	summarizeChapters,
	type ChapterEntity,
	type ChapterSummary,
} from '~/features/chapter/domain/entities/chapter.entity';
import {
	summarizeEvidence,
	type EvidenceEntity,
	type EvidenceSummary,
} from '~/features/evidence/domain/entities/evidence.entity';
import {
	deriveDeadline,
	pickPenyusunanAktif,
	type DeadlineUrgency,
	type LedProjectEntity,
	type ProjectDeadline,
} from '~/features/led-project/domain/entities/led-project.entity';
import { type StudyProgramEntity } from '~/features/study-program/domain/entities/study-program.entity';

/**
 * Aturan turunan Dashboard Utama (docs/application_flow.md §4.0).
 *
 * Berkas ini **tidak menuliskan satu pun aturan hitung baru**. Seluruhnya
 * memanggil ulang fungsi domain yang sudah dipakai Dashboard Prodi dan Dashboard
 * Project LED — `summarizeChapters`, `summarizeEvidence`,
 * `pickPenyusunanAktif`, `deriveDeadline` — persis seperti yang dijanjikan
 * komentar masing-masing fungsi itu. Menyalin aturannya ke sini akan membuat
 * angka institusi perlahan menyimpang dari angka prodi, dan dua dashboard yang
 * menyebut hal sama dengan angka berbeda lebih buruk daripada tidak punya
 * dashboard institusi sama sekali.
 *
 * Yang benar-benar baru di sini hanya cara **membandingkan tenggat** untuk
 * mengurutkan tabel Dokumen LED aktif. Komposisi peringkat akreditasi, masa
 * berlakunya, dan tabel Perlu Segera Disusun sudah dibuang dari halaman;
 * datanya tetap ada di DB.
 */

/** Satu prodi beserta penyusunan aktifnya; bahan tabel Dokumen LED aktif (§4.0c). */
export type ProgramReadinessRow = {
	program: StudyProgramEntity;
	penyusunanAktif: LedProjectEntity | null;
	/** Ringkasan bab **yang sedang disusun**; nol semua bila belum menyusun. */
	chapterSummary: ChapterSummary;
	/** `null` bila belum menyusun, atau penyusunannya tidak dipatok tenggat. */
	tenggat: ProjectDeadline | null;
};

/** §4.0d — bekal prodi yang berlaku lintas penyusunan. */
export type InstitutionResources = {
	/** Hanya `ownerTipe = TENANT`, supaya cocok dengan `/dashboard/evidence` (§4.4). */
	evidenceTenant: EvidenceSummary;
};

export type InstitutionReadiness = {
	/** Seluruh prodi, urutan apa adanya. Dipakai agregat, bukan dirender. */
	rows: ProgramReadinessRow[];
	sumberDaya: InstitutionResources;
};

/**
 * Data mentah yang sudah **dikelompokkan** oleh pemanggil.
 *
 * Sengaja bukan id-per-id: repository membaca dan mem-parse seluruh koleksi tiap
 * kali dipanggil, jadi bertanya per prodi berarti N kali parse untuk tiap
 * koleksi, tiap render. Pengelompokannya dikerjakan sekali di hook.
 */
export type InstitutionReadinessInput = {
	programs: StudyProgramEntity[];
	/** Seluruh `DOKUMEN_LED` prodi tersebut, belum dipilah aktif/arsip. */
	projectsByProgram: Map<string, LedProjectEntity[]>;
	chaptersByProject: Map<string, ChapterEntity[]>;
	/** Bukti dukung `owner_tipe = TENANT`, berlaku lintas prodi. */
	evidenceTenant: EvidenceEntity[];
	now?: number;
};

/**
 * Satu baris per prodi, memakai aturan yang sama persis dengan Dashboard Prodi.
 *
 * Bab hanya dibaca dari **dokumen yang sedang disusun**, dengan alasan yang sama
 * seperti §5.1b: mencampur dokumen lama yang sudah tuntas membuat angkanya selalu
 * terlihat bagus dan justru menyembunyikan pekerjaan yang belum jalan.
 */
export function buildProgramReadinessRows({
	programs,
	projectsByProgram,
	chaptersByProject,
	now = Date.now(),
}: Pick<
	InstitutionReadinessInput,
	'programs' | 'projectsByProgram' | 'chaptersByProject' | 'now'
>): ProgramReadinessRow[] {
	return programs.map((program) => {
		const { aktif } = pickPenyusunanAktif(
			projectsByProgram.get(program.id) ?? [],
		);

		const chapters = aktif ? (chaptersByProject.get(aktif.id) ?? []) : [];

		return {
			program,
			penyusunanAktif: aktif,
			chapterSummary: summarizeChapters(chapters),
			tenggat: aktif ? deriveDeadline(aktif.tenggat, now) : null,
		};
	});
}

/** Makin kecil makin menekan; penyusunan tanpa tenggat paling belakang. */
const deadlineRank: Record<DeadlineUrgency, number> = {
	LEWAT: 0,
	DEKAT: 1,
	AMAN: 2,
};

/**
 * Membandingkan dua tenggat: yang paling menekan lebih dulu (LEWAT, DEKAT,
 * AMAN, lalu sisa hari terkecil).
 *
 * Penyusunan tanpa tenggat (`null`) turun paling bawah alih-alih dianggap aman:
 * tidak dipatok adalah pilihan yang sah (§14), jadi ia tidak boleh mendahului
 * penyusunan yang tenggatnya nyata — tapi juga tidak boleh terbaca terlambat.
 * Aturan nulls-last yang sama dipakai `ledProjectRepository.findPaged`.
 *
 * Hanya memakai kolom yang **terlihat** di tabel Dokumen LED aktif: urutan yang
 * bersandar pada angka yang tidak dirender memaksa pembaca mempercaya begitu
 * saja bahwa barisnya benar, sedangkan urutan yang bersandar pada kolomnya
 * sendiri bisa diperiksa dengan mata.
 */
export function compareDeadlines(
	a: ProjectDeadline | null,
	b: ProjectDeadline | null,
): number {
	const urgensiA = a ? deadlineRank[a.urgensi] : 3;
	const urgensiB = b ? deadlineRank[b.urgensi] : 3;
	if (urgensiA !== urgensiB) return urgensiA - urgensiB;

	if (a && b && a.sisaHari !== b.sisaHari) return a.sisaHari - b.sisaHari;
	return 0;
}

/**
 * Seluruh angka Dashboard Utama dalam satu lintasan, supaya halaman tinggal
 * merender dan hook tidak perlu tahu urutan pemanggilannya.
 */
export function buildInstitutionReadiness({
	programs,
	projectsByProgram,
	chaptersByProject,
	evidenceTenant,
	now = Date.now(),
}: InstitutionReadinessInput): InstitutionReadiness {
	const rows = buildProgramReadinessRows({
		programs,
		projectsByProgram,
		chaptersByProject,
		now,
	});

	return {
		rows,
		sumberDaya: {
			evidenceTenant: summarizeEvidence(evidenceTenant),
		},
	};
}
