import { accreditationSetRepository } from '~/features/accreditation-set/data/repositories/accreditation-set.repository';
import { type ChapterTemplateEntity } from '~/features/accreditation-set/domain/entities/chapter-template.entity';
import { rubricCriterionAmiRepository } from '~/features/assessment/data/repositories/rubric-criterion-ami.repository';
import {
	type RubricCriterion,
	type RubricLevel,
} from './rubric-criterion.entity';

/** Poin panduan yang dirujuk AI saat menyusun sebuah bab. Pedoman = teks nyata dari `ChapterTemplate.subBab[].panduan`; rubrik = data nyata dari `rubricCriterionAmiRepository`. */
export type TipeSumberPanduan =
	| 'PANDUAN_LAM'
	| 'TEMPLATE_LKPS'
	| 'DOKUMEN_RUBRIK';

/** Dokumen sumber sebuah poin; padanan `PanduanReferensi` (docs/database.md §13). */
export type SumberPanduan = {
	id: string;
	tipe: TipeSumberPanduan;
	judul: string;
	tipeFile: string;
};

/**
 * Satu poin pedoman siap tampil; padanan `PanduanDetail` (§14) yang sudah
 * digabung dengan dokumen induknya dan dengan `PANDUAN_DETAIL_BAB` (§15).
 *
 * `urutanBab` tidak ikut di sini karena poin yang sampai ke pemanggil memang
 * sudah tersaring untuk satu bab — pola yang sama dipakai `findRubrikDipakaiForBab`.
 */
export type PoinPanduan = {
	id: string;
	sumber: SumberPanduan;
	/** Penomoran sub-bab hasil ekstraksi, mis. "C" untuk sub-bab, "C.1" untuk sub-sub-babnya. */
	kodePoin: string;
	judulPoin: string;
	isiTeks: string;
};

/** Satu indikator rubrik beserta level tertinggi yang dikejar tulisan bab. */
export type ButirRubrikDipakai = {
	kriteria: RubricCriterion;
	/** `rubric_used` didokumentasikan sebagai teks rubrik skor tertinggi. */
	target: RubricLevel;
};

const MATRIKS_PENILAIAN: SumberPanduan = {
	id: 'panduan-matriks-lam-teknik',
	tipe: 'DOKUMEN_RUBRIK',
	judul: 'Matriks Penilaian LAM Teknik',
	tipeFile: 'pdf',
};

/**
 * Kelompokkan kriteria satu bab berdasarkan `kriteria.kriteria` (nama
 * kelompok) apa adanya -- data nyata dari Set Akreditasi yang dipilih
 * dokumen ini, bukan lagi rentang nomor indikator LAM Teknik yang
 * di-hardcode (C.1–C.7). Berapa pun jumlah kelompoknya dan apa pun
 * namanya di set kustom, pengelompokan ini ikut -- tidak berasumsi
 * strukturnya selalu LAM Teknik 64-indikator.
 */
export function kelompokkanKriteria(
	kriteria: RubricCriterion[],
): { judul: string; indikator: RubricCriterion[] }[] {
	const urutanMuncul: string[] = [];
	const perKelompok = new Map<string, RubricCriterion[]>();
	for (const k of kriteria) {
		if (!perKelompok.has(k.kriteria)) {
			perKelompok.set(k.kriteria, []);
			urutanMuncul.push(k.kriteria);
		}
		perKelompok.get(k.kriteria)!.push(k);
	}
	return urutanMuncul.map((judul) => ({ judul, indikator: perKelompok.get(judul)! }));
}

/** ponytail: plafon 26 sub-bab (A-Z) -- sama seperti chapter-toc.entity.ts::hurufDariUrutan. */
function hurufDariUrutan(urutan: number): string {
	return String.fromCharCode(64 + urutan);
}

type SubBabRingkas = { kode: string; judul: string; panduan: string };

/** Ratakan pohon sub-bab jadi daftar linear berkode "A", "B", "C.1", "C.2"… */
function ratakanSubBab(subBab: ChapterTemplateEntity['subBab']): SubBabRingkas[] {
	const hasil: SubBabRingkas[] = [];
	for (const s of subBab) {
		const kode = hurufDariUrutan(s.urutan);
		hasil.push({ kode, judul: s.judul, panduan: s.panduan });
		for (const anak of s.anak) {
			hasil.push({ kode: `${kode}.${anak.urutan}`, judul: anak.judul, panduan: anak.panduan });
		}
	}
	return hasil;
}

/** Poin pedoman penulisan bab ini -- teks nyata dari `ChapterTemplate.subBab[].panduan`. Larik kosong = belum pernah ekstrak, bukan gagal muat. */
export async function findPanduanForBab(
	urutanBab: number,
	accreditationSetId: string | null | undefined,
): Promise<PoinPanduan[]> {
	if (!accreditationSetId) return [];

	const [templates, set] = await Promise.all([
		accreditationSetRepository.findChapterTemplates(accreditationSetId),
		accreditationSetRepository.findById(accreditationSetId),
	]);
	const bab = templates.find((t) => t.urutan === urutanBab);
	if (!bab) return [];

	const sumber: SumberPanduan = {
		id: `panduan-set-${accreditationSetId}`,
		tipe: 'PANDUAN_LAM',
		judul: set?.dokumen.find((d) => d.tipe === 'PANDUAN_LAM')?.namaBerkas ?? 'Panduan Penyusunan LED',
		tipeFile: 'pdf',
	};

	return ratakanSubBab(bab.subBab)
		.filter((s) => s.panduan.trim().length > 0)
		.map((s) => ({
			id: `poin-pedoman-${urutanBab}-${s.kode}`,
			sumber,
			kodePoin: s.kode,
			judulPoin: s.judul,
			isiTeks: s.panduan,
		}));
}

/** Rubrik yang jadi sasaran tulisan satu bab — indikator AMI yang `urutanBab`-nya mencakup bab ini. */
export async function findRubrikDipakaiForBab(
	urutanBab: number,
	accreditationSetId: string | null | undefined,
): Promise<ButirRubrikDipakai[]> {
	const semua = await rubricCriterionAmiRepository.findAll(accreditationSetId);
	return semua
		.filter((kriteria) => kriteria.urutanBab.includes(urutanBab))
		.map((kriteria) => ({
			kriteria,
			target: kriteria.levelSkor.reduce((a, b) => (b.skor > a.skor ? b : a)),
		}));
}

/** Dokumen matriks penilaian; dipakai kelompok rubrik di panel. */
export function sumberRubrik(): SumberPanduan {
	return MATRIKS_PENILAIAN;
}
