/**
 * Badan laci kutipan: satu kalimat pengantar, deretan kartu petikan, lalu
 * catatan status di kakinya.
 *
 * Diangkat dari `chapter-evidence-detail-sheet.tsx` saat laci panduan (§11.1b)
 * membutuhkan bentuk yang sama persis. Menyalinnya berarti memelihara dua daftar
 * yang harus tetap terlihat sama tanpa satu pun mekanisme yang memaksanya —
 * kesalahan yang sama seperti sebelum `Sheet` diangkat dari
 * `evidence-detail-panel.tsx` ke `core/components/ui`.
 *
 * Yang **tidak** ikut diangkat: kepala laci. Di situlah kedua laci memang
 * berbeda — yang satu memerikan berkas (ikon tipe, badge status, ukuran, waktu
 * unggah), yang satu memerikan poin panduan (kode poin, dokumen sumber).
 *
 * **`asal` diterima sudah jadi**, bukan sebagai angka halaman. Potongan bukti
 * dukung dan pedoman punya halaman; potongan rubrik tidak — matriks penilaian
 * sebuah tabel, dan nomor halaman untuk satu sel rubrik tidak punya dasar apa
 * pun. Membiarkan komponen ini memilih di antara keduanya berarti menaruh
 * pengetahuan tentang bentuk sumber datanya di lapisan yang paling tidak berhak
 * memilikinya.
 *
 * `catatanKaki` wajib, bukan opsional: kedua laci menampilkan isi yang masih
 * tiruan, dan laci yang lupa menyatakannya adalah cacat yang tidak boleh mungkin
 * terjadi karena seseorang lupa menuliskannya — alasan yang sama yang membuat
 * `SheetHeader` merender sendiri tombol tutupnya.
 */
export type PotonganTampil = {
	id: string;
	kutipan: string;
	/** Sudah jadi: `hlm. 24`, `hlm. 24–25`, `Skor 4`, `Bunyi kriteria`. */
	asal: string;
	judulBagian: string | null;
};

export function ChapterChunkList({
	potongan,
	pengantar,
	catatanKaki,
}: {
	potongan: PotonganTampil[];
	/** Mis. "3 bagian berkas ini dipakai saat menyusun bab tersebut." */
	pengantar: string;
	/** Menyatakan bahwa isinya masih contoh; lihat JSDoc di atas. */
	catatanKaki: string;
}) {
	return (
		<>
			<p className="text-xs leading-relaxed text-muted-foreground">
				{pengantar}
			</p>

			<ul className="space-y-2">
				{potongan.map((bagian) => (
					<li
						key={bagian.id}
						className="rounded-md border border-border bg-muted/40 p-2.5"
					>
						<p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							{bagian.asal}
							{bagian.judulBagian && ` · ${bagian.judulBagian}`}
						</p>
						<p className="mt-1.5 text-sm leading-relaxed">{bagian.kutipan}</p>
					</li>
				))}
			</ul>

			<p className="pt-1 text-xs leading-relaxed text-muted-foreground">
				{catatanKaki}
			</p>
		</>
	);
}
