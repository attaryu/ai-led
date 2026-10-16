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

/** Skor 0–4. `null` = belum dipilih; 0 adalah skor yang sah. */
export type SkorIndikator = 0 | 1 | 2 | 3 | 4;
export const SKOR_PILIHAN: readonly SkorIndikator[] = [0, 1, 2, 3, 4];

export type PilihanIndikator = { dipilih: boolean; skor: SkorIndikator | null };
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
 * Skor `0` valid; `null` (belum dipilih) membuat seluruh payload ditolak.
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

export type HasilIkuSetor = {
	kode: string;
	/** Ada hanya pada IKU yang gagal; selalu diperiksa sebelum field lain. */
	error?: string;
	capaian?: { nilai?: string; sumber?: string };
	evaluasi?: EvaluasiSetor;
	analisisKetercapaian?: string;
	usulanTargetTahunDepan?: string;
	strategiPencapaian?: string;
	sarprasDibutuhkan?: string;
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
const barisLebar = (isi: PmNode[]): PmNode => baris([sel('tableCell', isi, KOLOM_TABEL_SETOR.length)]);
const barisJudul = (judul: string): PmNode => barisLebar([paragraf(judul, true)]);

/**
 * Satu tabel untuk satu IKU. Kolom No/Indikator/Target dari permintaan; Capaian
 * dan Evaluasi hanya dari respons — tidak ada nilai yang dikarang. IKU yang
 * `error` tetap menjadi tabel (Capaian berisi keterangan, Evaluasi kosong, empat
 * bagian analisis kosong) agar penulis bisa melengkapinya manual. Bagian
 * `tambahan` hanya muncul bila API mengembalikannya.
 */
export function bangunTabelSetor(iku: IkuPayload, hasil: HasilIkuSetor | undefined): PmNode {
	const gagal = !hasil || Boolean(hasil.error);
	const capaian: PmNode[] = gagal
		? [paragraf(hasil?.error ?? 'Capaian tidak ditemukan')]
		: [paragraf(hasil.capaian?.nilai ?? ''), ...(hasil.capaian?.sumber ? [paragraf(`Sumber: ${hasil.capaian.sumber}`)] : [])];
	const evaluasi = !gagal && hasil.evaluasi ? labelEvaluasi[hasil.evaluasi] ?? hasil.evaluasi : '';
	const d = gagal ? undefined : hasil;

	const bagian: [string, string | undefined][] = [
		['Analisis Ketercapaian', d?.analisisKetercapaian],
		['Strategi Pencapaian', d?.strategiPencapaian],
		['Sarpras Dibutuhkan', d?.sarprasDibutuhkan],
		['Usulan Target Tahun Depan', d?.usulanTargetTahunDepan],
	];
	if (d?.evaluasi === 'BELUM_MEMENUHI' && d.tambahan) {
		bagian.push(
			['Faktor Pendukung', d.tambahan.faktorPendukung],
			['Faktor Penghambat', d.tambahan.faktorPenghambat],
			['Akar Masalah', d.tambahan.akarMasalah],
			['Tindak Lanjut', d.tambahan.tindakLanjut],
		);
	}

	return {
		type: 'table',
		content: [
			baris(KOLOM_TABEL_SETOR.map((k) => sel('tableHeader', [paragraf(k, true)]))),
			baris([
				sel('tableCell', [paragraf(iku.kode)]),
				sel('tableCell', [paragraf(iku.indikator)]),
				sel('tableCell', [paragraf(iku.target)]),
				sel('tableCell', capaian),
				sel('tableCell', [paragraf(evaluasi)]),
			]),
			...bagian.flatMap(([judul, isi]) => [barisJudul(judul), barisLebar(paragrafDariTeks(isi))]),
		],
	};
}

/** Pasangkan hasil ke `ikuList` lewat `kode` (bukan posisi) — hasil bisa lebih pendek saat dibatalkan. */
export function bangunSemuaTabelSetor(ikuList: IkuPayload[], hasil: HasilIkuSetor[]): PmNode[] {
	const perKode = new Map(hasil.map((h) => [h.kode, h]));
	return ikuList.map((iku) => bangunTabelSetor(iku, perKode.get(iku.kode)));
}

/** Teks sel pertama baris data tabel = `kode`; dipakai mengenali tabel hasil Setor ke LED yang sama saat dijalankan ulang. */
export function kodeTabelSetor(tabel: PmNode): string | null {
	const header = tabel.content?.[0]?.content?.map((c) => textOf(c)) ?? [];
	if (header.join('|') !== KOLOM_TABEL_SETOR.join('|')) return null;
	const kode = textOf(tabel.content?.[1]?.content?.[0]);
	return kode || null;
}

function textOf(node: PmNode | undefined): string {
	if (!node) return '';
	if (node.type === 'text') return node.text ?? '';
	return (node.content ?? []).map(textOf).join('').trim();
}

export type { PmNode };
