import {
	pickChaptersNeedingAttention,
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
	pickSiklusAktif,
	type LedProjectEntity,
	type ProjectDeadline,
} from '~/features/led-project/domain/entities/led-project.entity';
import {
	buildProgramAttention,
	type ProgramAttentionItem,
} from '~/features/study-program/domain/entities/program-readiness.entity';
import {
	deriveAccreditationValidity,
	peringkatAkreditasiEnum,
	type AccreditationValidity,
	type PeringkatAkreditasi,
	type StudyProgramEntity,
} from '~/features/study-program/domain/entities/study-program.entity';
import { type UserEntity } from '~/features/users/domain/entities/user.entity';

/**
 * Aturan turunan Dashboard Utama (docs/application_flow.md §4.0).
 *
 * Berkas ini **tidak menuliskan satu pun aturan hitung baru**. Seluruhnya
 * memanggil ulang fungsi domain yang sudah dipakai Dashboard Prodi dan Dashboard
 * Project LED — `summarizeChapters`, `summarizeEvidence`, `pickSiklusAktif`,
 * `buildProgramAttention`, `deriveDeadline`, `deriveAccreditationValidity` —
 * persis seperti yang dijanjikan komentar masing-masing fungsi itu. Menyalin
 * aturannya ke sini akan membuat angka institusi perlahan menyimpang dari angka
 * prodi, dan dua dashboard yang menyebut hal sama dengan angka berbeda lebih
 * buruk daripada tidak punya dashboard institusi sama sekali.
 *
 * Yang benar-benar baru di sini hanya cara **mengagregasi** dan cara
 * **mengurutkan** baris.
 */

/** Satu prodi sebagai satu baris di tabel perbandingan (§4.0c). */
export type ProgramReadinessRow = {
	program: StudyProgramEntity;
	/** `null` bila prodi belum pernah terakreditasi — bukan berarti kedaluwarsa. */
	akreditasi: AccreditationValidity | null;
	siklusAktif: LedProjectEntity | null;
	/** Ringkasan bab **siklus berjalan**; nol semua bila tidak ada yang berjalan. */
	chapterSummary: ChapterSummary;
	/** `null` bila tidak ada siklus, atau siklusnya tidak dipatok tenggat. */
	tenggat: ProjectDeadline | null;
	attention: ProgramAttentionItem[];
	mendesak: number;
	perluDitindak: number;
};

/**
 * Blok A — capaian akreditasi yang sudah disahkan (kerangka waktu: masa lalu).
 *
 * Disajikan sebagai **distribusi**, bukan rata-rata: peringkat itu ordinal, dan
 * merata-ratakan Unggul dengan Baik menghasilkan angka yang tidak berarti apa
 * pun.
 */
export type InstitutionAccreditation = {
	totalProdi: number;
	komposisi: Record<PeringkatAkreditasi, number>;
	/** Prodi yang `berlaku_sampai_akreditasi`-nya sudah lewat. */
	kedaluwarsa: number;
	/** Prodi yang masa berlakunya tersisa ≤ 365 hari. */
	mendekati: number;
};

/**
 * Blok B — usaha yang sedang berjalan (kerangka waktu: sekarang).
 *
 * Seluruh angka di sini **hanya milik siklus berjalan**. Peringkat akreditasi
 * dan akumulasi lintas siklus tidak boleh ikut: itu kesalahan yang sudah pernah
 * dibuat dan diperbaiki di Dashboard Prodi (§5.1, catatan di PRD §3.8).
 */
export type InstitutionCycles = {
	totalProdi: number;
	prodiBersiklus: number;
	/** 0–100; berapa banyak prodi yang punya siklus berjalan. */
	persenProdiBersiklus: number;
	babTotal: number;
	babTerisi: number;
	babTerkunci: number;
	persenKelengkapan: number;
	persenKesiapanReview: number;
	tenggatLewat: number;
	tenggatDekat: number;
};

/** Blok D — bekal prodi yang berlaku lintas siklus. */
export type InstitutionResources = {
	/** Hanya `ownerTipe = TENANT`, supaya cocok dengan `/dashboard/evidence` (§4.4). */
	evidenceTenant: EvidenceSummary;
	prodiTanpaPenyusun: number;
};

export type InstitutionReadiness = {
	/** Sudah terurut: yang paling perlu ditindak di atas. */
	rows: ProgramReadinessRow[];
	akreditasi: InstitutionAccreditation;
	siklus: InstitutionCycles;
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
	/** Bukti dukung `owner_tipe = PROGRAM_STUDI` milik prodi tersebut. */
	evidenceByProgram: Map<string, EvidenceEntity[]>;
	penyusunByProgram: Map<string, UserEntity[]>;
	/** Bukti dukung `owner_tipe = TENANT`, berlaku lintas prodi. */
	evidenceTenant: EvidenceEntity[];
	now?: number;
};

function percent(bagian: number, total: number): number {
	return total === 0 ? 0 : Math.round((bagian / total) * 100);
}

/**
 * Satu baris per prodi, memakai aturan yang sama persis dengan Dashboard Prodi.
 *
 * Bab hanya dibaca dari **siklus berjalan**, dengan alasan yang sama seperti
 * §5.1b: mencampur dokumen lama yang sudah tuntas membuat angkanya selalu
 * terlihat bagus dan justru menyembunyikan pekerjaan yang belum jalan.
 */
export function buildProgramReadinessRows({
	programs,
	projectsByProgram,
	chaptersByProject,
	evidenceByProgram,
	penyusunByProgram,
	now = Date.now(),
}: Omit<InstitutionReadinessInput, 'evidenceTenant'>): ProgramReadinessRow[] {
	return programs.map((program) => {
		const { aktif } = pickSiklusAktif(projectsByProgram.get(program.id) ?? []);

		const chapters = aktif ? (chaptersByProject.get(aktif.id) ?? []) : [];
		const evidenceProdi = summarizeEvidence(
			evidenceByProgram.get(program.id) ?? [],
		);
		const penyusun = penyusunByProgram.get(program.id) ?? [];

		const attention = buildProgramAttention({
			berlakuSampaiAkreditasi: program.berlakuSampaiAkreditasi,
			siklusAktif: aktif,
			chapterAttention: pickChaptersNeedingAttention(chapters, now),
			evidenceProdi,
			jumlahPenyusun: penyusun.length,
			now,
		});

		return {
			program,
			akreditasi: deriveAccreditationValidity(
				program.berlakuSampaiAkreditasi,
				now,
			),
			siklusAktif: aktif,
			chapterSummary: summarizeChapters(chapters),
			tenggat: aktif ? deriveDeadline(aktif.tenggat, now) : null,
			attention,
			mendesak: attention.filter((item) => item.severitas === 'MENDESAK').length,
			perluDitindak: attention.filter(
				(item) => item.severitas === 'PERLU_DITINDAK',
			).length,
		};
	});
}

/**
 * Urutan tabel §4.0c: **paling berisiko di atas**, bukan alfabet.
 *
 * Halaman ini dibaca dari atas, jadi hal pertama yang terlihat harus hal yang
 * perlu ditindak. Mengurutkan menurut nama prodi memindahkan pekerjaan mencari
 * "siapa yang tertinggal" kembali ke pembacanya — padahal itulah satu-satunya
 * pertanyaan yang halaman ini ada untuk menjawabnya.
 *
 * Kelengkapan jadi pemutus ketiga supaya prodi yang sama-sama bersih tetap
 * terurut dari yang paling sedikit progresnya; nama prodi jadi pemutus terakhir
 * agar urutannya tidak berubah-ubah antar render.
 */
export function compareProgramRisk(
	a: ProgramReadinessRow,
	b: ProgramReadinessRow,
): number {
	if (a.mendesak !== b.mendesak) return b.mendesak - a.mendesak;
	if (a.perluDitindak !== b.perluDitindak) {
		return b.perluDitindak - a.perluDitindak;
	}

	const kelengkapanA = a.siklusAktif ? a.chapterSummary.persenKelengkapan : 0;
	const kelengkapanB = b.siklusAktif ? b.chapterSummary.persenKelengkapan : 0;
	if (kelengkapanA !== kelengkapanB) return kelengkapanA - kelengkapanB;

	return a.program.studyProgramName.localeCompare(b.program.studyProgramName);
}

/**
 * Blok A. Prodi `BELUM_TERAKREDITASI` masuk komposisi sebagai kategorinya
 * sendiri dan **tidak** dihitung kedaluwarsa: tidak pernah punya masa berlaku
 * berbeda dari masa berlaku yang sudah habis, dan keduanya tidak boleh
 * ditampilkan dengan cara yang sama (§5.1e).
 */
export function summarizeInstitutionAccreditation(
	programs: StudyProgramEntity[],
	now: number = Date.now(),
): InstitutionAccreditation {
	const komposisi = Object.fromEntries(
		peringkatAkreditasiEnum.options.map((peringkat) => [peringkat, 0]),
	) as Record<PeringkatAkreditasi, number>;

	let kedaluwarsa = 0;
	let mendekati = 0;

	for (const program of programs) {
		komposisi[program.peringkatAkreditasi] += 1;

		const validity = deriveAccreditationValidity(
			program.berlakuSampaiAkreditasi,
			now,
		);
		if (validity?.urgensi === 'KEDALUWARSA') kedaluwarsa += 1;
		if (validity?.urgensi === 'MENDEKATI') mendekati += 1;
	}

	return { totalProdi: programs.length, komposisi, kedaluwarsa, mendekati };
}

/**
 * Blok B, diagregasi sebagai **jumlah bab lintas prodi** — bukan rata-rata
 * persen antar prodi.
 *
 * Pertanyaannya "berapa banyak pekerjaan yang sudah jadi", sehingga prodi
 * dengan bab lebih banyak memang harus berbobot lebih. Rata-rata persen
 * memberi bobot sama ke tiap prodi, sehingga satu prodi kecil yang tuntas bisa
 * menutupi prodi besar yang mandek.
 *
 * Prodi tanpa siklus berjalan menyumbang nol ke pembilang **dan** penyebut: ia
 * sudah terhitung di angka `prodiBersiklus`, dan menghitungnya lagi sebagai bab
 * kosong akan menghukum angka kelengkapan dua kali untuk satu keadaan yang sama.
 */
export function summarizeInstitutionCycles(
	rows: ProgramReadinessRow[],
): InstitutionCycles {
	let prodiBersiklus = 0;
	let babTotal = 0;
	let babTerisi = 0;
	let babTerkunci = 0;
	let tenggatLewat = 0;
	let tenggatDekat = 0;

	for (const row of rows) {
		if (!row.siklusAktif) continue;

		prodiBersiklus += 1;
		babTotal += row.chapterSummary.total;
		babTerisi += row.chapterSummary.terisi;
		babTerkunci += row.chapterSummary.terkunci;

		// Siklus tanpa tenggat tidak ikut dihitung berisiko: tidak dipatok adalah
		// pilihan yang sah (§14), bukan keterlambatan.
		if (row.tenggat?.urgensi === 'LEWAT') tenggatLewat += 1;
		if (row.tenggat?.urgensi === 'DEKAT') tenggatDekat += 1;
	}

	return {
		totalProdi: rows.length,
		prodiBersiklus,
		persenProdiBersiklus: percent(prodiBersiklus, rows.length),
		babTotal,
		babTerisi,
		babTerkunci,
		persenKelengkapan: percent(babTerisi, babTotal),
		persenKesiapanReview: percent(babTerkunci, babTotal),
		tenggatLewat,
		tenggatDekat,
	};
}

/**
 * Seluruh angka Dashboard Utama dalam satu lintasan, supaya halaman tinggal
 * merender dan hook tidak perlu tahu urutan pemanggilannya.
 */
export function buildInstitutionReadiness({
	programs,
	projectsByProgram,
	chaptersByProject,
	evidenceByProgram,
	penyusunByProgram,
	evidenceTenant,
	now = Date.now(),
}: InstitutionReadinessInput): InstitutionReadiness {
	const rows = buildProgramReadinessRows({
		programs,
		projectsByProgram,
		chaptersByProject,
		evidenceByProgram,
		penyusunByProgram,
		now,
	}).sort(compareProgramRisk);

	return {
		rows,
		akreditasi: summarizeInstitutionAccreditation(programs, now),
		siklus: summarizeInstitutionCycles(rows),
		sumberDaya: {
			evidenceTenant: summarizeEvidence(evidenceTenant),
			prodiTanpaPenyusun: programs.filter(
				(program) => (penyusunByProgram.get(program.id) ?? []).length === 0,
			).length,
		},
	};
}
