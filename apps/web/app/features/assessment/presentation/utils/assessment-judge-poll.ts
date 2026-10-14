/**
 * Logika polling judge on-demand, dipisah dari hook supaya bisa dites tanpa React.
 *
 * Status judge hidup di memori apps/ai (seperti RAGAS) dan hilang bila proses restart; verdict
 * yang sudah ditulis tetap ada di Postgres. Karena itu 404 pada polling BUKAN galat: hasilnya
 * "hilang" dan pemanggil cukup memuat ulang hasil yang sudah tersimpan.
 */

import {
	type JudgeProgress,
	type JudgeStatusSnapshot,
} from '../../domain/entities/indicator-result.entity';

export type { JudgeProgress, JudgeStatusSnapshot };

export type PollOutcome =
	| { kind: 'selesai'; progres: JudgeProgress }
	| { kind: 'gagal'; pesan: string }
	| { kind: 'hilang'; progres: JudgeProgress }
	| { kind: 'dibatalkan' };

export async function pollJudge({
	cek,
	masihBerlaku,
	tidur,
	jedaMs,
	onProgres,
}: {
	/** Satu kali baca status; `null` = apps/ai tidak mengenali judge ini (404). */
	cek: () => Promise<JudgeStatusSnapshot | null>;
	/** `false` bila pemicunya sudah tidak relevan (mis. sesi berganti). */
	masihBerlaku: () => boolean;
	tidur: (ms: number) => Promise<void>;
	jedaMs: number;
	onProgres: (progres: JudgeProgress) => void;
}): Promise<PollOutcome> {
	let terakhir: JudgeProgress = { total: 0, done: 0, skipped: 0, failed: 0 };

	for (;;) {
		if (!masihBerlaku()) return { kind: 'dibatalkan' };
		const snapshot = await cek();
		if (!masihBerlaku()) return { kind: 'dibatalkan' };
		if (snapshot === null) return { kind: 'hilang', progres: terakhir };

		terakhir = {
			total: snapshot.total,
			done: snapshot.done,
			skipped: snapshot.skipped,
			failed: snapshot.failed,
		};
		onProgres(terakhir);

		if (snapshot.status === 'completed') return { kind: 'selesai', progres: terakhir };
		if (snapshot.status === 'failed') {
			return { kind: 'gagal', pesan: snapshot.error ?? 'Judge gagal — coba jalankan ulang.' };
		}
		await tidur(jedaMs);
	}
}

/** Satu kalimat ringkasan akhir untuk pengguna. `done` sudah termasuk yang gagal. */
export function ringkasJudge(progres: JudgeProgress): string {
	const bagian = [`${progres.done - progres.failed} dijudge`];
	if (progres.skipped > 0) {
		bagian.push(`${progres.skipped} dilewati (bukti tidak tersimpan atau belum dinilai)`);
	}
	if (progres.failed > 0) bagian.push(`${progres.failed} gagal`);
	return bagian.join(', ');
}

/** Penjumlahan progres beberapa run berurutan (satu per sesi) jadi satu angka untuk "Judge semua". */
export function jumlahkanProgres(a: JudgeProgress, b: JudgeProgress): JudgeProgress {
	return {
		total: a.total + b.total,
		done: a.done + b.done,
		skipped: a.skipped + b.skipped,
		failed: a.failed + b.failed,
	};
}

/**
 * Id sesi unik dengan urutan pertama-muncul. Tampilan "terbaru" menggabungkan hasil terbaru per
 * indikator dari SEMUA sesi dokumen, jadi "Judge semua" harus menjalankan satu judge per sesi tersebut.
 */
export function sesiIdUnik(hasil: { sesiId: string }[]): string[] {
	return [...new Set(hasil.map((h) => h.sesiId))];
}

/** Kunci sasaran satu run judge per indikator; dipakai mengikat pesan hasil ke laci indikatornya. */
export function kunciSasaranJudge(sesiId: string, indikatorNo: number, subNo: string): string {
	return `${sesiId}|${indikatorNo}|${subNo}`;
}
