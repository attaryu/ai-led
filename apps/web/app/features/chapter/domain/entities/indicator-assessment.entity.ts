/**
 * Penilaian Indikator di Editor Bab — memilih indikator matriks penilaian yang
 * dipetakan ke section aktif, menentukan skor 0–4, lalu mengirimnya ke
 * `POST /dokumen/:id/setor-led` (docs/setor-led-api.md). Berkas ini hanya memuat
 * logika murni: validasi pilihan, penyusunan payload, dan konversi hasil job
 * menjadi node tabel ProseMirror. Tidak ada I/O.
 */

/** Satu indikator yang dipetakan ke section (`GET bab/:id/sections/:sectionId/indikator`). */
export type IndikatorSection = {
	id: string;
	/** `RubricCriterion.criterionCode` — unik per set akreditasi, stabil antar muat. */
	kode: string;
	deskripsi: string;
};

/**
 * Skor target 1–4 (0 tidak boleh dinilai di UI, walau API menerimanya).
 * `null` = belum dipilih.
 */
export type SkorIndikator = 1 | 2 | 3 | 4;
export const SKOR_PILIHAN: readonly SkorIndikator[] = [1, 2, 3, 4];

export type PilihanIndikator = { dipilih: boolean; skor: SkorIndikator | null };

/** Skor yang terisi sendiri begitu indikator dicentang. */
export const SKOR_BAWAAN: SkorIndikator = 2;

/**
 * Mencentang/membatalkan centang. Dicentang tanpa skor sebelumnya → skor bawaan 2; skor yang sudah
 * pernah dipilih (walau sempat dinonaktifkan) dipertahankan, dan membatalkan centang tidak menghapusnya.
 */
export function aturCentang(lama: PilihanIndikator, dicentang: boolean): PilihanIndikator {
	return { dipilih: dicentang, skor: dicentang && lama.skor === null ? SKOR_BAWAAN : lama.skor };
}
/** Pilihan per id indikator; indikator yang tak ada di sini = belum disentuh (tak dipilih). */
export type PilihanSection = Record<string, PilihanIndikator>;

export type IkuPayload = { kode: string; indikator: string; target: string };

export type HasilPayload =
	| { ok: true; ikuList: IkuPayload[] }
	| { ok: false; indikatorTanpaSkor: string[] };

export function jumlahDipilih(pilihan: PilihanSection): number {
	return Object.values(pilihan).filter((p) => p.dipilih).length;
}

/**
 * Menyusun `ikuList`: hanya indikator yang dicentang, urut seperti daftar
 * indikator. Skor sebelumnya pada indikator yang tak dicentang tidak ikut.
 * `null` (belum dipilih) membuat seluruh payload ditolak.
 */
export function susunPayload(indikator: IndikatorSection[], pilihan: PilihanSection): HasilPayload {
	const ikuList: IkuPayload[] = [];
	const tanpaSkor: string[] = [];
	for (const item of indikator) {
		const p = pilihan[item.id];
		if (!p?.dipilih) continue;
		if (p.skor === null) {
			tanpaSkor.push(item.id);
			continue;
		}
		ikuList.push({ kode: item.kode, indikator: item.deskripsi, target: String(p.skor) });
	}
	return tanpaSkor.length > 0 ? { ok: false, indikatorTanpaSkor: tanpaSkor } : { ok: true, ikuList };
}

// ── Hasil job SETOR_LED (docs/setor-led-api.md §3) ─────────────────────────

export type EvaluasiSetor = 'MELAMPAUI' | 'MEMENUHI' | 'BELUM_MEMENUHI';

/**
 * Elemen `result.hasil[]` setelah kontrak baru (docs/setor-led-api.md §3): hanya
 * `score` 0–4 dan narasi. Tidak ada `capaian` maupun `evaluasi` dari backend —
 * keduanya diturunkan di sisi UI dari `score` dan `target` (lihat bawah).
 */
export type HasilIkuSetor = {
	kode: string;
	/** Ada hanya pada IKU yang gagal; selalu diperiksa sebelum field lain. */
	error?: string;
	score?: number;
	analisisKetercapaian?: string;
	usulanTargetTahunDepan?: string;
	strategiPencapaian?: string;
	sarprasDibutuhkan?: string;
	/** Hanya ada bila `score` lebih rendah dari `target`. */
	tambahan?: {
		faktorPendukung?: string;
		faktorPenghambat?: string;
		akarMasalah?: string;
		tindakLanjut?: string;
	};
};

export const labelEvaluasi: Record<EvaluasiSetor, string> = {
	MELAMPAUI: 'Melampaui standar',
	MEMENUHI: 'Memenuhi standar',
	BELUM_MEMENUHI: 'Belum memenuhi standar',
};

/** `score >= target` = memenuhi (sama = Memenuhi, lebih tinggi = Melampaui); selain itu belum memenuhi. */
export function tentukanEvaluasi(score: number, target: number): EvaluasiSetor {
	if (score < target) return 'BELUM_MEMENUHI';
	return score === target ? 'MEMENUHI' : 'MELAMPAUI';
}

/** Capaian terhadap target dalam persen = score/target × 100 (target selalu 1–4). */
export function hitungCapaianPersen(score: number, target: number): number {
	return (score / target) * 100;
}

/** Angka berformat Indonesia: koma desimal, maksimum dua digit, tanpa nol di ekor ("87,5"). */
export function formatAngka(nilai: number): string {
	return String(Math.round(nilai * 100) / 100).replace('.', ',');
}

export const KOLOM_TABEL_SETOR = ['No', 'Indikator', 'Target', 'Capaian', 'Evaluasi'] as const;

// ── Konversi ke node ProseMirror (skema TableKit + StarterKit) ─────────────

type PmNode = {
	type: string;
	attrs?: Record<string, unknown>;
	content?: PmNode[];
	text?: string;
	marks?: { type: string }[];
};

const teks = (text: string, tebal = false): PmNode => ({
	type: 'text',
	text,
	...(tebal ? { marks: [{ type: 'bold' }] } : {}),
});
const paragraf = (text: string, tebal = false): PmNode =>
	text.trim() ? { type: 'paragraph', content: [teks(text, tebal)] } : { type: 'paragraph' };

/**
 * Teks isi → paragraf. Baris baru dipertahankan; string berpenomoran satu baris
 * ("1) … 2) …", bentuk `strategiPencapaian`/`sarprasDibutuhkan`) dipecah di
 * tiap penanda nomor supaya terbaca sebagai daftar, tanpa mengubah kata-katanya.
 */
export function paragrafDariTeks(isi: string | undefined): PmNode[] {
	const bersih = (isi ?? '').trim();
	if (!bersih) return [paragraf('')];
	const baris = bersih.split(/\r?\n/).flatMap((b) => (/^\s*1\)/.test(b) ? b.split(/\s+(?=\d+\)\s)/) : [b]));
	return baris.map((b) => b.trim()).filter(Boolean).map((b) => paragraf(b));
}

const sel = (tipe: 'tableCell' | 'tableHeader', isi: PmNode[], colspan = 1): PmNode => ({
	type: tipe,
	attrs: { colspan, rowspan: 1, colwidth: null },
	content: isi.length > 0 ? isi : [paragraf('')],
});
const baris = (sels: PmNode[]): PmNode => ({ type: 'tableRow', content: sels });

/** Satu baris gabungan (colspan 5): tiap bagian = judul tebal + isinya, hanya dipisah baris baru, tanpa garis pembatas. */
function barisAnalisis(bagian: [string, string | undefined][]): PmNode {
	const isi = bagian.flatMap(([judul, teks]) => [paragraf(judul, true), ...paragrafDariTeks(teks)]);
	return baris([sel('tableCell', isi, KOLOM_TABEL_SETOR.length)]);
}

/**
 * Dua baris untuk satu IKU: baris data (No/Indikator/Target/Capaian/Evaluasi) dan SATU baris gabungan berisi
 * seluruh bagian analisis. Capaian = score/target × 100% dan Evaluasi = perbandingan score dengan target,
 * keduanya dihitung di sini dari `score` backend — tidak ada angka yang dikarang. Skor di bawah target memakai
 * empat bagian Faktor Pendukung/Penghambat, Akar Masalah, Tindak Lanjut (isi dari `tambahan`; kosong bila API tak
 * mengirimnya), selain itu empat narasi utama. IKU yang `error` tetap mendapat dua baris (Capaian berisi
 * keterangan, Evaluasi dan bagian analisis kosong) agar penulis bisa melengkapinya manual.
 */
export function bangunBarisIku(iku: IkuPayload, hasil: HasilIkuSetor | undefined): PmNode[] {
	const gagal = !hasil || Boolean(hasil.error) || typeof hasil.score !== 'number';
	const target = Number(iku.target);
	let capaian: PmNode[];
	let evaluasi = '';
	let bagian: [string, string | undefined][];

	if (gagal) {
		capaian = [paragraf(hasil?.error ?? 'Capaian tidak ditemukan')];
		bagian = [
			['Analisis Ketercapaian', undefined],
			['Usulan Target Tahun Depan', undefined],
			['Strategi Pencapaian', undefined],
			['Sarpras yang Dibutuhkan', undefined],
		];
	} else {
		const skor = hasil.score as number;
		capaian = [
			paragraf(`${formatAngka(hitungCapaianPersen(skor, target))}%`),
			paragraf(`Skor ${formatAngka(skor)}`),
		];
		const nilai = tentukanEvaluasi(skor, target);
		evaluasi = labelEvaluasi[nilai];
		bagian =
			nilai === 'BELUM_MEMENUHI'
				? [
						['Faktor Pendukung', hasil.tambahan?.faktorPendukung],
						['Faktor Penghambat', hasil.tambahan?.faktorPenghambat],
						['Akar Masalah', hasil.tambahan?.akarMasalah],
						['Tindak Lanjut', hasil.tambahan?.tindakLanjut],
					]
				: [
						['Analisis Ketercapaian', hasil.analisisKetercapaian],
						['Usulan Target Tahun Depan', hasil.usulanTargetTahunDepan],
						['Strategi Pencapaian', hasil.strategiPencapaian],
						['Sarpras yang Dibutuhkan', hasil.sarprasDibutuhkan],
					];
	}

	return [
		baris([
			sel('tableCell', [paragraf(iku.kode)]),
			sel('tableCell', [paragraf(iku.indikator)]),
			sel('tableCell', [paragraf(iku.target)]),
			sel('tableCell', capaian),
			sel('tableCell', [paragraf(evaluasi)]),
		]),
		barisAnalisis(bagian),
	];
}

export function barisHeaderSetor(): PmNode {
	return baris(KOLOM_TABEL_SETOR.map((k) => sel('tableHeader', [paragraf(k, true)])));
}

/** SATU tabel untuk seluruh IKU: satu baris header, lalu dua baris per IKU. Hasil dipasangkan lewat `kode`, bukan posisi. */
export function bangunTabelSetor(ikuList: IkuPayload[], hasil: HasilIkuSetor[]): PmNode {
	const perKode = new Map(hasil.map((h) => [h.kode, h]));
	return {
		type: 'table',
		content: [barisHeaderSetor(), ...ikuList.flatMap((iku) => bangunBarisIku(iku, perKode.get(iku.kode)))],
	};
}

/** Isi kanvas satu draft penilaian: tabel, lalu paragraf kosong agar kursor bisa melewati tabel. */
export function bangunDokumenSetor(ikuList: IkuPayload[], hasil: HasilIkuSetor[]): PmNode {
	return { type: 'doc', content: [bangunTabelSetor(ikuList, hasil), { type: 'paragraph' }] };
}

function textOf(node: PmNode | undefined): string {
	if (!node) return '';
	if (node.type === 'text') return node.text ?? '';
	return (node.content ?? []).map(textOf).join('').trim();
}

export type { PmNode };
