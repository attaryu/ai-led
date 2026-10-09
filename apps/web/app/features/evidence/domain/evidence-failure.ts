import { type EvidenceStatus } from './entities/evidence.entity';

/**
 * Kegagalan proses bukti dukung yang perlu ditanyakan ke pengguna: ulangi atau tidak.
 *
 * Ada DUA jenis yang berbeda penanganannya, dan keduanya muncul di modal yang sama:
 *   - `unggah`    -- gagal di klien (presign, kirim ke penyimpanan, atau mencatat berkas).
 *                    Mengulang = mengunggah ulang berkas yang masih dipegang antrean.
 *   - `ekstraksi` -- unggahan sudah tercatat tetapi worker gagal mengekstraknya (status
 *                    GAGAL). Mengulang = `retryIngestion`, tanpa unggah ulang.
 *
 * Disatukan dalam satu daftar (bukan satu modal per berkas) karena unggah massal bisa
 * menggagalkan banyak berkas sekaligus; dua puluh modal beruntun tidak bisa dipakai.
 */
export type JenisKegagalan = 'unggah' | 'ekstraksi';

export type KegagalanProses = {
	/** `jenis:id` -- id baris antrean (unggah) atau id evidence (ekstraksi). */
	kunci: string;
	jenis: JenisKegagalan;
	/** Id yang dipakai untuk mengulang: id antrean (unggah) atau id evidence (ekstraksi). */
	id: string;
	nama: string;
	pesan: string;
};

export const PESAN_MAKS = 240;

export function kunciKegagalan(jenis: JenisKegagalan, id: string): string {
	return `${jenis}:${id}`;
}

/** Catatan kegagalan worker bisa panjang (jejak galat); modal hanya butuh intinya. */
export function ringkasPesan(pesan: string | null | undefined, maks = PESAN_MAKS): string {
	const bersih = (pesan ?? '').replace(/\s+/g, ' ').trim();
	if (!bersih) return 'Penyebab tidak dicatat.';
	return bersih.length > maks ? `${bersih.slice(0, maks - 1)}…` : bersih;
}

/**
 * Menambahkan kegagalan baru tanpa menggandakan: kegagalan yang sama (jenis + id) hanya
 * tampil sekali, dan pesannya diperbarui bila berubah. Urutan kemunculan dipertahankan.
 */
export function tambahKegagalan(daftar: KegagalanProses[], baru: KegagalanProses[]): KegagalanProses[] {
	const hasil = [...daftar];
	for (const item of baru) {
		const i = hasil.findIndex((x) => x.kunci === item.kunci);
		if (i >= 0) hasil[i] = item;
		else hasil.push(item);
	}
	return hasil;
}

/** Baris antrean unggah, dipersempit ke yang dibutuhkan di sini. */
export type BarisUnggah = {
	id: string;
	fileName: string;
	phase: string;
	error?: string;
};

/**
 * Unggahan yang baru saja gagal dan belum pernah ditanyakan.
 *
 * `sudahDiumumkan` dipangkas ke baris yang MASIH gagal: begitu sebuah baris diulang dan
 * keluar dari `gagal`, ia dilupakan -- jadi kalau ia gagal lagi, pengguna ditanya lagi.
 * Tanpa pemangkasan, kegagalan kedua pada berkas yang sama tidak pernah muncul.
 */
export function kegagalanUnggahBaru(
	baris: BarisUnggah[],
	sudahDiumumkan: ReadonlySet<string>,
): { baru: KegagalanProses[]; diumumkan: Set<string> } {
	const gagal = baris.filter((b) => b.phase === 'gagal');
	const masihGagal = new Set(gagal.map((b) => b.id));
	const diumumkan = new Set([...sudahDiumumkan].filter((id) => masihGagal.has(id)));

	const baru: KegagalanProses[] = [];
	for (const b of gagal) {
		if (diumumkan.has(b.id)) continue;
		diumumkan.add(b.id);
		baru.push({
			kunci: kunciKegagalan('unggah', b.id),
			jenis: 'unggah',
			id: b.id,
			nama: b.fileName,
			pesan: ringkasPesan(b.error ?? 'Unggahan gagal.'),
		});
	}
	return { baru, diumumkan };
}

export type StatusTerbaru = { status: EvidenceStatus; namaDokumen: string; catatanGagal: string | null };

/**
 * Memilah berkas yang dilacak berdasarkan status terbarunya.
 *
 *   - `gagal`    -> ditanyakan ke pengguna, dan berhenti dilacak (sudah dijawab/diumumkan).
 *   - `selesai`  -> SIAP, berhenti dilacak.
 *   - `menunggu` -> MENUNGGU/DIPROSES, tetap dilacak.
 *   - `hilang`   -> tidak ada lagi di daftar (dihapus pengguna), berhenti dilacak.
 */
export function pilahStatus(
	dilacak: string[],
	terbaru: ReadonlyMap<string, StatusTerbaru>,
): { gagal: KegagalanProses[]; selesai: string[]; menunggu: string[]; hilang: string[] } {
	const hasil = { gagal: [] as KegagalanProses[], selesai: [] as string[], menunggu: [] as string[], hilang: [] as string[] };
	for (const id of dilacak) {
		const s = terbaru.get(id);
		if (!s) hasil.hilang.push(id);
		else if (s.status === 'GAGAL') {
			hasil.gagal.push({
				kunci: kunciKegagalan('ekstraksi', id),
				jenis: 'ekstraksi',
				id,
				nama: s.namaDokumen,
				pesan: ringkasPesan(s.catatanGagal),
			});
		} else if (s.status === 'SIAP') hasil.selesai.push(id);
		else hasil.menunggu.push(id);
	}
	return hasil;
}
