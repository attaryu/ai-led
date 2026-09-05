import { type RekomendasiDokumen } from '../../../domain/entities/document-recommendation.entity';
import { sidikJari } from './chapter-scoring.mock';

/**
 * Tiruan rekomendasi dokumen AI untuk tab Generasi.
 *
 * Ini **satu-satunya berkas yang perlu diganti** saat backend siap, mengikuti
 * kebiasaan `chapter-generation.mock.ts` dan `chapter-guidance.mock.ts`. Yang
 * sungguhan datang dari satu panggilan LLM yang membaca pedoman subbab lalu
 * memerikan dokumen apa yang isinya dibutuhkan; pengelompokan dan urutannya
 * ditentukan di sana, bukan di sini.
 *
 * **Kalimatnya contoh, dan dipakai ulang di semua bab.** Menulis rumusan
 * khusus per bab berarti mengarang 14 himpunan tuntutan dokumen yang mengaku
 * menyampaikan kebutuhan LAM — jenis karangan yang sudah ditolak dua kali oleh
 * `guidance-point.entity.ts` untuk alasan yang sama. Yang dinilai dari mock ini
 * tata letaknya, bukan isinya, dan enam kalimat sudah cukup untuk itu.
 *
 * **Sinkron dan murni**, alasan yang sama dengan `chapter-chunk.mock.ts`:
 * `TabsContent` di Editor Bab tidak
 * memakai `keepMounted`, jadi panel Generasi dilepas dari pohon tiap kali tab
 * berpindah — sumber asinkron berarti spinner di kolom 320 px pada setiap
 * kunjungan. Tidak ada `delay` di sini karena tidak ada yang perlu terlihat
 * menunggu.
 */

/**
 * Rumusan kebutuhan isi dokumen, ditulis dengan pola yang sama: sebutan
 * dokumennya, lalu `termasuk` diikuti rincian isi yang dicari.
 *
 * Sengaja **tidak menyebut nama berkas maupun nomor peraturan**. Yang pertama
 * berubah tiap kampus; yang kedua membuat kalimat karangan terbaca sebagai
 * kutipan resmi — larangan yang sudah ditulis `POIN_PEDOMAN`.
 */
const KEBUTUHAN_CONTOH = [
	'Statuta institusi beserta peraturan turunannya, termasuk dasar penyelenggaraan, struktur organisasi, pembagian kewenangan, dan ketentuan operasional yang berlaku di tingkat institusi.',
	'Rencana strategis institusi dan program studi, termasuk visi, misi, tujuan, sasaran, strategi, program kerja, indikator kinerja, target, serta prioritas pengembangannya.',
	'Dokumen yang memuat mekanisme formal penetapan dan pemutakhiran kebijakan, termasuk tahapan penyusunan, pihak yang terlibat, dasar pertimbangan, dan tindak lanjut yang disepakati.',
	'Laporan hasil audit atau evaluasi internal, termasuk temuan, akar masalah, rekomendasi perbaikan, penanggung jawab, dan status tindak lanjutnya.',
	'Bukti pelaksanaan kegiatan pada periode yang dilaporkan, termasuk waktu pelaksanaan, pihak yang terlibat, keluaran yang dihasilkan, beserta dokumentasi pendukungnya.',
	'Data kinerja terukur tiga tahun terakhir, termasuk angka capaian per tahun, dasar perhitungan, sumber datanya, dan pembanding yang dipakai menilai ketercapaiannya.',
];

/**
 * Rekomendasi untuk bab yang sedang dibuka, beserta mana yang sudah terpenuhi.
 *
 * **`terpenuhi` diturunkan dari centang bukti dukung, dan itu penyederhanaan
 * yang disadari.** Definisi sebenarnya "isi dokumen itu benar-benar terpakai di
 * konten hasil generate" — sesuatu yang cuma bisa dijawab backend sesudah
 * generate berjalan. Yang ditiru di sini hanya **perpindahan keadaannya**,
 * supaya lipatan "N sudah digunakan" bisa dinilai tanpa menyalakan backend:
 * centang sebuah berkas, satu kartu berpindah ke lipatan.
 *
 * Pemetaan berkas -> kartu memakai {@link sidikJari}, bukan urutan centang:
 * berkas yang sama selalu memenuhi kartu yang sama, jadi mencentang lalu
 * membatalkan tidak membuat kartu lain yang berpindah. Alasan determinismenya
 * sama dengan yang sudah ditulis di berkas asalnya.
 */
export function rekomendasiUntukBab(
	terpilih: ReadonlySet<string>,
): RekomendasiDokumen[] {
	const terjawab = new Set<number>();
	for (const buktiId of terpilih) {
		terjawab.add(sidikJari(buktiId) % KEBUTUHAN_CONTOH.length);
	}

	return KEBUTUHAN_CONTOH.map((deskripsi, urutan) => ({
		id: `rekomendasi-${urutan}`,
		deskripsi,
		terpenuhi: terjawab.has(urutan),
	}));
}
