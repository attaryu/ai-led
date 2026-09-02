/**
 * Pemformat angka khusus Penilaian AMI.
 *
 * Di `presentation/utils` karena keduanya murni soal cara menulis angka di
 * layar — tidak ada aturan domain di sini, dan `assessment-source.entity.ts`
 * tidak boleh tahu apa pun tentang tanda hubung untuk nilai kosong.
 */

/**
 * Skor: **selalu dua angka di belakang koma.**
 *
 * Sebelumnya desimal hanya ditulis kalau memang ada, dengan alasan "3" lebih
 * tenang dibaca daripada "3,00" pada delapan belas baris berjajar. Aturan itu
 * dibalik 2026-09-02: yang dicari pembacanya justru ke mana sebuah angka
 * condong. Skor komposit dihitung dari rumus seperti `((I x 2) + II) / 3` dan
 * jarang jatuh tepat di bilangan bulat, jadi 2,67 dan 3,00 adalah dua hal yang
 * berbeda — menulis yang kedua sebagai "3" menyembunyikan bahwa ia memang bulat
 * dan bukan hasil pembulatan. Lebar yang seragam juga membuat kolomnya berbaris
 * rapi di bawah `tabular-nums`.
 *
 * **Dua angka, bukan tiga**, karena dua itulah yang benar-benar tersimpan:
 * `IndicatorResult.score` bertipe `Decimal(5,2)`. Digit ketiga akan selamanya
 * nol, dan angka yang selalu nol adalah janji presisi yang datanya tidak punya.
 *
 * Pemisahnya koma, mengikuti cara orang Indonesia menulis angka. Dipasang lewat
 * `replace`, bukan `toLocaleString('id-ID')`: yang terakhir bergantung pada data
 * ICU milik runtime — hasilnya bisa berbeda antar peramban dan bisa menyelipkan
 * pemisah ribuan yang tidak pernah diminta.
 */
export function formatSkor(nilai: number | null): string {
	if (nilai === null) return '—';
	return nilai.toFixed(2).replace('.', ',');
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
