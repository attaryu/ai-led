/**
 * Pemformat angka khusus Penilaian AMI.
 *
 * Di `presentation/utils` karena keduanya murni soal cara menulis angka di
 * layar — tidak ada aturan domain di sini, dan `assessment-source.entity.ts`
 * tidak boleh tahu apa pun tentang tanda hubung untuk nilai kosong.
 */

/**
 * Skor: **desimal hanya ditulis kalau memang ada.**
 *
 * Skor indikator praktis selalu bulat — rubriknya berjenjang 0–4 — sehingga
 * "3,0" cuma menambah satu karakter yang tidak menerangkan apa pun, dan pada
 * delapan belas baris berjajar ia jadi derau yang harus dilewati mata tiap kali.
 *
 * Tapi aturannya bukan "selalu bulatkan", dan bedanya penting: indikator komposit
 * dihitung dari rumus seperti `((I x 2) + II) / 3` yang jarang jatuh tepat di
 * bilangan bulat, dan `IndicatorResult.score` di Prisma bertipe `Decimal(5,2)`
 * justru untuk itu. Rata-rata dokumen pun pecahan. Membulatkan semuanya akan
 * diam-diam menampilkan 2,67 sebagai 3 — kesalahan yang tidak akan pernah
 * terlihat oleh siapa pun yang membacanya.
 */
export function formatSkor(nilai: number | null): string {
	if (nilai === null) return '—';
	return Number.isInteger(nilai) ? String(nilai) : nilai.toFixed(2);
}

/**
 * Keyakinan sebagai persen bulat, untuk keterangan yang menyertai badge-nya.
 *
 * Tanpa imbuhan kata apa pun: ia dipakai di dalam kalimat yang sudah menyebut
 * "keyakinan", sehingga "72% yakin" akan mengulang kata itu dua kali dalam satu
 * tarikan napas.
 */
export function formatConfidence(nilai: number | null): string {
	if (nilai === null) return 'tidak dilaporkan';
	return `${Math.round(nilai * 100)}%`;
}
