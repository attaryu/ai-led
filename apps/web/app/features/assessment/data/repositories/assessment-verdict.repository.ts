import { z } from 'zod';

import { type ReviewIndicatorDto } from '../../domain/dtos/review-indicator.dto';
import {
	assessmentVerdictSchema,
	type AssessmentVerdictEntity,
} from '../../domain/entities/assessment-verdict.entity';
import { assessmentLocalSource } from '../sources/local/assessment-local.source';

/**
 * Keputusan Penjamin Mutu — penilaian final (docs/database.md §12b: celah,
 * tabelnya belum ada).
 *
 * **Repository terpisah dari sesi, dan itu inti rancangannya.** Hasil AI
 * ditimpa tiap penilaian ulang; keputusan tidak boleh ikut tertimpa. Menaruh
 * keduanya di satu repository berarti setiap penulisan hasil menyentuh berkas
 * yang sama dengan keputusan, dan cukup satu penyalinan keliru untuk menghapus
 * yang seharusnya kekal.
 */

export const assessmentVerdictRepository = {
	/**
	 * **Tidak ada data contoh di sini, dan itu keputusan yang disengaja.**
	 *
	 * Versi pertama berkas ini menaburkan dua keputusan contoh untuk dokumen `2` —
	 * satu koreksi basi, satu persetujuan — supaya ketiga status bisa dilihat tanpa
	 * menyiapkan apa pun. Itu salah, dan salahnya lebih dalam dari sekadar data
	 * contoh yang keliru:
	 *
	 * - **Keputusan adalah pernyataan manusia.** Hasil AI boleh di-seed karena
	 *   AI-nya memang menghitungnya. Persetujuan tidak: yang di-seed itu klaim
	 *   bahwa seseorang bernama Ahmad Fauzi sudah memeriksa dan menyetujui sebuah
	 *   indikator, padahal tidak ada yang pernah melakukannya. Di layar ia muncul
	 *   sebagai "sudah disetujui" tanpa ada yang menyetujui — persis keadaan yang
	 *   seluruh fitur ini dibangun untuk mencegahnya.
	 * - **Ia hidup kembali sendiri.** Seed dibangun setiap kali kunci
	 *   penyimpanannya tidak ada, sehingga mencabut semua keputusan lalu membuka
	 *   halaman dari keadaan bersih memunculkannya lagi seolah aplikasi memutuskan
	 *   sendiri.
	 * - **Ia bahkan tidak menghasilkan keadaan yang dijanjikannya.** Skornya
	 *   dipatok angka tetap sementara skor AI ikut isi bab, jadi "koreksi"
	 *   contohnya berulang kali jatuh sama persis dengan hitungan AI — yang
	 *   menurut `mengubahSkor` berarti bukan koreksi sama sekali.
	 *
	 * Ketiga status tetap mudah dilihat tanpa seed, lewat jalan yang jujur:
	 * setujui satu indikator, sunting babnya, lalu jalankan penilaian ulang.
	 */
	findAll(): AssessmentVerdictEntity[] {
		const stored = assessmentLocalSource.getVerdicts();
		if (!stored) return [];

		try {
			const parsed = z
				.array(assessmentVerdictSchema)
				.safeParse(JSON.parse(stored));
			if (parsed.success) return parsed.data;
		} catch {
			// Sama seperti repository lain: JSON rusak diperlakukan sebagai bentuk
			// yang tidak cocok, bukan dibiarkan meledak jauh dari penyebabnya.
		}

		// Bentuknya tidak dikenali. Dikosongkan, bukan dipertahankan: keputusan yang
		// tidak bisa dibaca tidak bisa dipertanggungjawabkan isinya.
		return [];
	},

	save(verdicts: AssessmentVerdictEntity[]): void {
		assessmentLocalSource.setVerdicts(JSON.stringify(verdicts));
	},

	notify(): void {
		window.dispatchEvent(new Event('storage-update'));
	},

	findByDokumenId(dokumenId: string): AssessmentVerdictEntity[] {
		return this.findAll().filter(
			(verdict) => verdict.dokumenId === dokumenId,
		);
	},

	/**
	 * Menyimpan keputusan satu indikator — menyetujui maupun mengoreksi.
	 *
	 * Keduanya satu jalur karena keduanya menyatakan hal yang sama: seseorang
	 * sudah melihat indikator ini dan menetapkan angka yang berlaku. Yang
	 * membedakan hanya apakah angkanya sama dengan hitungan AI, dan itu
	 * diturunkan saat dibaca — bukan dikirim pemanggil.
	 *
	 * `skorMesinSaatDitinjau` dan `sesiIdSaatDitinjau` diisi di sini dari sesi yang
	 * sedang dilihat: keduanya harus sepasang, dan pemanggil yang bisa mengirimnya
	 * terpisah bisa membuat penanda basi berbohong.
	 *
	 * Meninjau ulang **mengganti** barisnya, tidak menumpuk riwayat: yang berlaku
	 * selalu keputusan terakhir, dan atribusinya ikut berpindah ke yang mengubah
	 * terakhir.
	 */
	upsert(
		dto: ReviewIndicatorDto,
		dasar: { skorMesin: number | null; sesiId: string },
	): AssessmentVerdictEntity {
		const semua = this.findAll();
		const lama = semua.find(
			(verdict) =>
				verdict.dokumenId === dto.dokumenId &&
				verdict.indikatorNo === dto.indikatorNo,
		);

		const verdict: AssessmentVerdictEntity = {
			id: lama?.id ?? `kp-${dto.dokumenId}-${dto.indikatorNo}`,
			dokumenId: dto.dokumenId,
			indikatorNo: dto.indikatorNo,
			skorFinal: dto.skorFinal,
			catatan: dto.catatan,
			skorMesinSaatDitinjau: dasar.skorMesin,
			sesiIdSaatDitinjau: dasar.sesiId,
			ditinjauOlehUserId: dto.ditinjauOlehUserId,
			ditinjauOlehNama: dto.ditinjauOlehNama,
			ditinjauPada: new Date().toISOString(),
		};

		this.save([...semua.filter((item) => item.id !== verdict.id), verdict]);
		this.notify();
		return verdict;
	},

	/**
	 * Mencabut keputusan; indikatornya kembali ke **Belum ditinjau**.
	 *
	 * Satu-satunya makna yang tersisa untuk aksi ini setelah "kembali ke angka
	 * AI" jadi persetujuan: "saya belum siap memutuskan".
	 */
	remove(dokumenId: string, indikatorNo: number): void {
		this.save(
			this.findAll().filter(
				(verdict) =>
					!(
						verdict.dokumenId === dokumenId &&
						verdict.indikatorNo === indikatorNo
					),
			),
		);
		this.notify();
	},

	deleteByDokumenId(dokumenId: string): void {
		this.save(this.findAll().filter((v) => v.dokumenId !== dokumenId));
	},
};
