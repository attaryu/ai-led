import * as React from 'react';
import {
	CaretDownIcon,
	CheckCircleIcon,
	SparkleIcon,
} from '@phosphor-icons/react';

import { ScrollArea } from '~/core/components/ui/scroll-area';
import { type RekomendasiDokumen } from '../../domain/entities/document-recommendation.entity';

/**
 * Blok rekomendasi dokumen di tab Generasi: dokumen yang *isinya* dibutuhkan
 * bab ini, beserta mana di antaranya yang sudah terjawab bukti dukung terpilih.
 *
 * **Yang sudah terpenuhi dilipat, bukan dibuang.** Membuangnya memang merebut
 * ruang paling banyak, tapi dua hal ikut hilang bersamanya. Pertama, keadaan
 * terpenuhi itulah satu-satunya konfirmasi bahwa unggahan penyusun benar-benar
 * terpakai — kartu yang lenyap tidak bisa dibedakan dari kartu yang gagal
 * muncul. Kedua, pemenuhan itu kesimpulan sistem: kalau ia keliru, kartu yang
 * disembunyikan membuat kekeliruannya mustahil dilihat, apalagi diperbaiki.
 * Prototipe rujukan (`apps/ai/generation-prototype`) mencatat pernah menghapus
 * kartunya lalu membalikkan keputusan itu — "TETAP ada setelah confirm/narasi
 * jadi, tidak dihapus lagi".
 *
 * **Tinggi blok dibatasi, bukan jumlah kartunya.** Frontend tidak pernah tahu
 * berapa kartu yang dikirim — pengelompokan dan jumlahnya ditentukan backend —
 * jadi membatasi *jumlah* yang terbuka tetap membuat tinggi blok berubah-ubah
 * mengikuti isi yang tidak bisa diduga. Batas tinggi membuat ruang untuk daftar
 * bukti dukung di bawahnya tidak pernah bisa habis, berapa pun yang datang —
 * sekaligus tetap menyusut sendiri saat yang tersisa tinggal satu-dua kartu.
 * Tanpa ini, empat kartu berkalimat panjang sudah cukup mendorong seluruh
 * daftar keluar layar — persis daftar yang harus dicentang untuk memenuhinya.
 * Pertimbangan yang sama dicatat blok rekomendasi di branch `dev-v1`.
 *
 * **Tombol lipatan di atas area gulung, dan kartu terpenuhi ditaruh paling
 * awal di dalamnya.** Urutan ini bukan selera. Dengan tombol di bawah dan kartu
 * terpenuhi menyusul di ekor daftar, menekannya tidak mengubah apa pun yang
 * terlihat: kartunya muncul di luar batas gulungan, dan pengguna membaca
 * kliknya sebagai gagal. Menaruh keduanya bersebelahan di puncak membuat isi
 * yang baru dibuka mendarat tepat di pandangan — tanpa perlu menggeser
 * gulungan dari kode, yang selalu bertengkar dengan gulungan yang sedang
 * dilakukan penggunanya sendiri.
 *
 * **Tanpa keadaan "semua terpenuhi".** Begitu tidak ada lagi yang tersisa,
 * yang tertinggal cuma eyebrow dan satu baris lipatan — tidak ada spanduk hijau
 * yang menyewa ruang selamanya. Keputusan yang sama sudah diambil
 * `AssessmentBabBanner`: `null` ketimbang keadaan kosong.
 *
 * **Tanpa tombol unggah sendiri.** Kepala panel sudah memuat "Unggah" yang
 * selalu tersedia; tombol kedua di dalam blok ini hanya akan bersaing dengannya
 * tanpa menawarkan jalan yang berbeda.
 */
export function ChapterDocumentRecommendation({
	rekomendasi,
}: {
	rekomendasi: RekomendasiDokumen[];
}) {
	const [lipatanTerbuka, setLipatanTerbuka] = React.useState(false);

	if (rekomendasi.length === 0) return null;

	const belum = rekomendasi.filter((butir) => !butir.terpenuhi);
	const sudah = rekomendasi.filter((butir) => butir.terpenuhi);
	const adaIsi = belum.length > 0 || lipatanTerbuka;

	return (
		<div className="mt-1 mb-2 border-b border-border pb-3">
			<div className="flex items-baseline justify-between gap-2">
				<p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					<SparkleIcon className="size-3.5" />
					Rekomendasi Dokumen
				</p>

				{/*
				 * Pencacah hilang begitu tidak ada lagi yang tersisa — "0 belum ada"
				 * mengumumkan ketiadaan, dan baris lipatan di bawah sudah mengatakan
				 * seluruhnya dengan angka yang bermakna.
				 */}
				{belum.length > 0 && (
					<p className="shrink-0 text-xs text-muted-foreground tabular-nums">
						{belum.length} belum ada
					</p>
				)}
			</div>

			{sudah.length > 0 && (
				<button
					type="button"
					onClick={() => setLipatanTerbuka((terbuka) => !terbuka)}
					aria-expanded={lipatanTerbuka}
					aria-controls={sudah
						.map((butir) => `rekomendasi-terpenuhi-${butir.id}`)
						.join(' ')}
					className="mt-1.5 flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					<CaretDownIcon
						className={
							lipatanTerbuka
								? 'size-3 shrink-0 rotate-180 transition-transform'
								: 'size-3 shrink-0 transition-transform'
						}
					/>
					{sudah.length} terpenuhi
				</button>
			)}

			{/*
			 * `ScrollArea` dipakai demi scrollbar tipis yang sama dengan daftar bukti
			 * dukung di bawahnya — yang bawaan peramban selebar ~17 px memakan ruang
			 * yang di kolom 320 px justru paling mahal.
			 *
			 * Dua penimpaan pada viewport-nya wajib, bukan hiasan. Komponen itu
			 * merender viewport `size-full`, dan tinggi persen atas induk ber-`height:
			 * auto` jatuh kembali ke `auto` — `max-h` di akar saja cuma memotong isi
			 * tanpa pernah memunculkan gulungan. Memindahkan batasnya ke viewport
			 * sendiri (`h-auto max-h-52`) membuat elemen yang memang punya
			 * `overflow` itulah yang dibatasi.
			 *
			 * **Batas, bukan tinggi pasti.** `h-52` benar saat kartunya banyak dan
			 * salah saat sedikit: begitu yang tersisa tinggal satu-dua kartu, blok
			 * ini menganga kosong belasan baris — dan keadaan hampir-selesai itulah
			 * yang paling sering dilihat penyusun menjelang akhir.
			 */}
			{adaIsi && (
				<ScrollArea className="mt-1.5 [&_[data-slot=scroll-area-viewport]]:h-auto [&_[data-slot=scroll-area-viewport]]:max-h-52">
					<ul className="space-y-1.5 pr-2.5">
						{/*
						 * Tetap terpasang saat dilipat, bukan dilepas dari pohon: tombol
						 * di atas menunjuknya lewat `aria-controls`, dan acuan ke elemen
						 * yang tidak ada membuat pola disclosure-nya tidak bisa diikuti
						 * pembaca layar — aturan yang sama dipakai textarea prompt di kaki
						 * tab ini.
						 */}
						{sudah.map((butir) => (
							<li
								key={butir.id}
								id={`rekomendasi-terpenuhi-${butir.id}`}
								hidden={!lipatanTerbuka}
								className="rounded-md border border-emerald-200/60 bg-emerald-50 p-2.5 dark:border-emerald-800/40 dark:bg-emerald-950/30"
							>
								{/*
								 * Dipangkas dua baris: yang sudah terpenuhi tidak lagi jadi
								 * pekerjaan, dan kalimat penuhnya cuma mengulang apa yang
								 * sudah dijawab. `title` menyimpan bunyi utuhnya untuk yang
								 * perlu memeriksa — termasuk saat pemenuhannya keliru.
								 */}
								<p
									className="line-clamp-2 text-sm leading-relaxed"
									title={butir.deskripsi}
								>
									{butir.deskripsi}
								</p>

								{/*
								 * Bentuk pil yang sama persis dengan `EvidenceStatusBadge`
								 * `SIAP` — hijau di aplikasi ini sudah berarti "beres, boleh
								 * dipakai", dan hijau kedua dengan rupa berbeda hanya akan
								 * membuat pembacanya menebak apakah maknanya juga berbeda.
								 */}
								<span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-emerald-200/50 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-900/30 dark:text-emerald-300">
									<CheckCircleIcon className="size-3.5" />
									Terpenuhi
								</span>
							</li>
						))}

						{belum.map((butir) => (
							<li
								key={butir.id}
								className="rounded-md border border-border bg-muted/40 p-2.5"
							>
								<p className="text-sm leading-relaxed">{butir.deskripsi}</p>
							</li>
						))}
					</ul>
				</ScrollArea>
			)}
		</div>
	);
}
