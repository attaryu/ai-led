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
 * Project LED — `summarizeChapters`, `summarizeEvidence`,
 * `pickPenyusunanAktif`, `deriveDeadline`, `deriveAccreditationValidity` —
 * persis seperti yang dijanjikan komentar masing-masing fungsi itu. Menyalin
 * aturannya ke sini akan membuat angka institusi perlahan menyimpang dari angka
 * prodi, dan dua dashboard yang menyebut hal sama dengan angka berbeda lebih
 * buruk daripada tidak punya dashboard institusi sama sekali.
 *
 * Yang benar-benar baru di sini hanya cara **membagi** prodi ke dua tabel dan
 * cara **mengurutkan** masing-masing.
 */

/** Satu prodi sebagai satu baris di salah satu tabel §4.0c. */
export type ProgramReadinessRow = {
	program: StudyProgramEntity;
	/** `null` bila prodi belum pernah terakreditasi — bukan berarti kedaluwarsa. */
	akreditasi: AccreditationValidity | null;
	penyusunanAktif: LedProjectEntity | null;
	/** Ringkasan bab **yang sedang disusun**; nol semua bila belum menyusun. */
	chapterSummary: ChapterSummary;
	/** `null` bila belum menyusun, atau penyusunannya tidak dipatok tenggat. */
	tenggat: ProjectDeadline | null;
};

/**
 * §4.0a — capaian akreditasi yang sudah disahkan (kerangka waktu: masa lalu).
 *
 * Disajikan sebagai **distribusi**, bukan rata-rata: peringkat itu ordinal, dan
 * merata-ratakan Unggul dengan Baik menghasilkan angka yang tidak berarti apa
 * pun.
 */
export type InstitutionAccreditation = {
	totalProdi: number;
	komposisi: Record<PeringkatAkreditasi, number>;
	/**
	 * 0–100 per peringkat, penyebutnya `totalProdi`. **Pelengkap `komposisi`,
	 * bukan penggantinya**: pembulatan bisa membuat jumlahnya tidak tepat 100
	 * (tiga prodi → 33+33+33), jadi jumlah prodi tetap harus ikut ditampilkan.
	 */
	persenKomposisi: Record<PeringkatAkreditasi, number>;
	/** Prodi yang `berlaku_sampai_akreditasi`-nya sudah lewat. */
	kedaluwarsa: number;
	/** Prodi yang masa berlakunya tersisa ≤ 365 hari. */
	mendekati: number;
	/**
	 * Prodi dengan masa berlaku terpendek lebih dulu, dipotong
	 * {@link MAX_ACCREDITATION_EXPIRY_SHOWN}.
	 *
	 * Angka `kedaluwarsa` dan `mendekati` di atas menjawab "berapa banyak";
	 * daftar ini menjawab "kapan, dan untuk prodi yang mana".
	 */
	terdekatBerakhir: AccreditationExpiry[];
};

/** Berapa banyak prodi yang muat di daftar masa berlaku sebelum sisanya dipotong. */
export const MAX_ACCREDITATION_EXPIRY_SHOWN = 5;

/**
 * Satu prodi di daftar masa berlaku terdekat (§4.0a).
 *
 * Sengaja tidak membawa keadaan penyusunannya. Daftar ini menjawab "kapan masa
 * berlaku kami berakhir" untuk **seluruh** prodi yang punya masa berlaku;
 * pertanyaan "siapa yang harus mulai sekarang" dijawab tabel Perlu Segera
 * Disusun (§4.0c), lengkap dengan tombolnya. Menjawabnya di dua tempat membuat
 * pembaca menebak-nebak mana yang mengikat.
 */
export type AccreditationExpiry = {
	program: StudyProgramEntity;
	validity: AccreditationValidity;
};

/** §4.0d — bekal prodi yang berlaku lintas penyusunan. */
export type InstitutionResources = {
	/** Hanya `ownerTipe = TENANT`, supaya cocok dengan `/dashboard/evidence` (§4.4). */
	evidenceTenant: EvidenceSummary;
	prodiTanpaPenyusun: number;
};

export type InstitutionReadiness = {
	/** Seluruh prodi, urutan apa adanya. Dipakai agregat, bukan dirender. */
	rows: ProgramReadinessRow[];
	/** Tabel pertama §4.0c, sudah terurut {@link compareDraftingUrgency}. */
	sedangMenyusun: ProgramReadinessRow[];
	/** Tabel kedua §4.0c, sudah terurut {@link compareAccreditationUrgency}. */
	perluDisusun: ProgramReadinessRow[];
	/**
	 * Prodi yang belum menyusun tapi akreditasinya masih panjang — tidak masuk
	 * tabel mana pun. Jumlahnya tetap dibawa supaya penjumlahan kedua tabel bisa
	 * dicocokkan dengan total prodi; tanpa itu, prodi yang hilang dari layar
	 * terbaca sebagai data yang tidak terhitung.
	 */
	belumPerlu: number;
	akreditasi: InstitutionAccreditation;
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
	/** Dipakai menghitung `prodiTanpaPenyusun` (§4.0d), bukan per baris tabel. */
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
			akreditasi: deriveAccreditationValidity(
				program.berlakuSampaiAkreditasi,
				now,
			),
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
 * Urutan tabel **Sedang Menyusun** (§4.0c): yang tenggatnya paling menekan di
 * atas.
 *
 * Kedua kuncinya sengaja hanya memakai kolom yang **terlihat** di tabel itu —
 * tenggat dan kelengkapan bab. Urutan yang bersandar pada angka yang tidak
 * dirender memaksa pembaca mempercaya begitu saja bahwa barisnya benar; urutan
 * yang bersandar pada kolomnya sendiri bisa diperiksa dengan mata.
 *
 * Penyusunan tanpa tenggat turun paling bawah alih-alih dianggap aman: tidak
 * dipatok adalah pilihan yang sah (§14), jadi ia tidak boleh mendahului
 * penyusunan yang tenggatnya nyata — tapi juga tidak boleh terbaca terlambat.
 * Aturan nulls-last yang sama dipakai `ledProjectRepository.findPaged`.
 */
export function compareDraftingUrgency(
	a: ProgramReadinessRow,
	b: ProgramReadinessRow,
): number {
	const urgensiA = a.tenggat ? deadlineRank[a.tenggat.urgensi] : 3;
	const urgensiB = b.tenggat ? deadlineRank[b.tenggat.urgensi] : 3;
	if (urgensiA !== urgensiB) return urgensiA - urgensiB;

	if (a.tenggat && b.tenggat && a.tenggat.sisaHari !== b.tenggat.sisaHari) {
		return a.tenggat.sisaHari - b.tenggat.sisaHari;
	}

	const kelengkapanA = a.chapterSummary.persenKelengkapan;
	const kelengkapanB = b.chapterSummary.persenKelengkapan;
	if (kelengkapanA !== kelengkapanB) return kelengkapanA - kelengkapanB;

	return a.program.studyProgramName.localeCompare(b.program.studyProgramName);
}

/**
 * Urutan tabel **Perlu Segera Disusun** (§4.0c): yang paling telat di atas.
 *
 * Prodi yang belum pernah terakreditasi ditaruh paling bawah, bukan paling
 * atas. Ia memang harus menyusun, tapi tidak punya tanggal yang sedang berjalan
 * — menyelipkannya di antara baris bertanggal memaksa pembaca membandingkan
 * "belum pernah" dengan "terlambat 39 hari", padahal keduanya tidak sebanding.
 */
export function compareAccreditationUrgency(
	a: ProgramReadinessRow,
	b: ProgramReadinessRow,
): number {
	if (a.akreditasi && b.akreditasi) {
		if (a.akreditasi.sisaHari !== b.akreditasi.sisaHari) {
			return a.akreditasi.sisaHari - b.akreditasi.sisaHari;
		}
	} else if (a.akreditasi !== b.akreditasi) {
		return a.akreditasi ? -1 : 1;
	}

	return a.program.studyProgramName.localeCompare(b.program.studyProgramName);
}

/**
 * §4.0a. Prodi `BELUM_TERAKREDITASI` masuk komposisi sebagai kategorinya
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

	const persenKomposisi = Object.fromEntries(
		Object.entries(komposisi).map(([peringkat, jumlah]) => [
			peringkat,
			percent(jumlah, programs.length),
		]),
	) as Record<PeringkatAkreditasi, number>;

	return {
		totalProdi: programs.length,
		komposisi,
		persenKomposisi,
		kedaluwarsa,
		mendekati,
		// Diisi `buildInstitutionReadiness`, yang sudah punya barisnya.
		terdekatBerakhir: [],
	};
}

/**
 * Prodi yang masa berlaku akreditasinya paling dekat berakhir, terpendek dulu
 * (§4.0a).
 *
 * Prodi yang belum pernah terakreditasi **tidak ikut**: tidak punya masa berlaku
 * bukan masa berlaku yang pendek, dan menaruhnya di daftar ini — di posisi mana
 * pun — memaksa pembaca membandingkan dua hal yang tidak sebanding (§5.1e). Ia
 * sudah punya tempatnya sendiri sebagai kategori di komposisi.
 */
export function pickAccreditationExpiringSoonest(
	rows: ProgramReadinessRow[],
	limit: number = MAX_ACCREDITATION_EXPIRY_SHOWN,
): AccreditationExpiry[] {
	return rows
		.filter((row) => row.akreditasi !== null)
		.map((row) => ({ program: row.program, validity: row.akreditasi! }))
		.sort((a, b) => a.validity.sisaHari - b.validity.sisaHari)
		.slice(0, limit);
}

export const programDraftingStatusEnum = [
	'PERLU_SEGERA_MENYUSUN',
	'SEDANG_MENYUSUN',
	'BELUM_PERLU',
] as const;
export type ProgramDraftingStatus = (typeof programDraftingStatusEnum)[number];

/**
 * Keadaan penyusunan satu prodi — aturan yang membagi prodi ke dua tabel §4.0c.
 *
 * `PERLU_SEGERA_MENYUSUN` mencakup **tiga** keadaan yang sama-sama berarti
 * "harus mulai sekarang": masa berlaku tersisa ≤ 365 hari, masa berlaku sudah
 * lewat, dan belum pernah terakreditasi sama sekali. Yang ketiga dulu tidak
 * ikut — `deriveAccreditationValidity(null)` mengembalikan `null` sehingga tidak
 * ada urgensi yang bisa dihitung — dan akibatnya prodi yang belum pernah
 * terakreditasi dan belum punya dokumen tidak muncul di tabel mana pun. Itu
 * keadaan paling awal yang bisa dialami sebuah prodi, bukan keadaan yang aman.
 *
 * Ini sekarang **satu-satunya** definisi. Sebelumnya aturan yang sama juga hidup
 * sebagai pemicu #3 `buildProgramAttention`, dan keduanya harus dijaga sejalan;
 * mesin atensi itu sudah dihapus bersama kolom yang merendernya.
 */
export function deriveProgramDraftingStatus(
	row: ProgramReadinessRow,
): ProgramDraftingStatus {
	if (row.penyusunanAktif) return 'SEDANG_MENYUSUN';
	if (row.akreditasi === null || row.akreditasi.urgensi !== 'AMAN') {
		return 'PERLU_SEGERA_MENYUSUN';
	}
	return 'BELUM_PERLU';
}

/**
 * Seluruh angka Dashboard Utama dalam satu lintasan, supaya halaman tinggal
 * merender dan hook tidak perlu tahu urutan pemanggilannya.
 */
export function buildInstitutionReadiness({
	programs,
	projectsByProgram,
	chaptersByProject,
	penyusunByProgram,
	evidenceTenant,
	now = Date.now(),
}: InstitutionReadinessInput): InstitutionReadiness {
	const rows = buildProgramReadinessRows({
		programs,
		projectsByProgram,
		chaptersByProject,
		now,
	});

	// Satu lintasan, tiga ember: tiap prodi masuk tepat satu, sehingga
	// `sedangMenyusun + perluDisusun + belumPerlu` selalu sama dengan jumlah prodi.
	const sedangMenyusun: ProgramReadinessRow[] = [];
	const perluDisusun: ProgramReadinessRow[] = [];
	let belumPerlu = 0;

	for (const row of rows) {
		switch (deriveProgramDraftingStatus(row)) {
			case 'SEDANG_MENYUSUN':
				sedangMenyusun.push(row);
				break;
			case 'PERLU_SEGERA_MENYUSUN':
				perluDisusun.push(row);
				break;
			default:
				belumPerlu += 1;
		}
	}

	return {
		rows,
		sedangMenyusun: sedangMenyusun.sort(compareDraftingUrgency),
		perluDisusun: perluDisusun.sort(compareAccreditationUrgency),
		belumPerlu,
		akreditasi: {
			...summarizeInstitutionAccreditation(programs, now),
			terdekatBerakhir: pickAccreditationExpiringSoonest(rows),
		},
		sumberDaya: {
			evidenceTenant: summarizeEvidence(evidenceTenant),
			prodiTanpaPenyusun: programs.filter(
				(program) => (penyusunByProgram.get(program.id) ?? []).length === 0,
			).length,
		},
	};
}
