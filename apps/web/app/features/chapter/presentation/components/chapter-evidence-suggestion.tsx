import * as React from 'react';
import { CaretDownIcon, SparkleIcon, UploadSimpleIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { type RekomendasiBukti } from '../../domain/entities/evidence-recommendation.entity';

/** Berapa banyak yang langsung terlihat sebelum sisanya dilipat. */
const TAMPIL_AWAL = 3;

/**
 * Blok rekomendasi bukti dukung di tab Generasi
 * (docs/application_flow.md §12.1b): berkas yang biasanya jadi tumpuan bab ini
 * tapi belum ada padanannya di pustaka, beserta satu jalan menuntaskannya.
 *
 * **Nasihat, bukan gerbang.** Generate tidak pernah dihalanginya. Dulu ada
 * kalimat yang menyatakan itu terang-terangan; ia dibuang karena tidak ada yang
 * perlu diselamatkannya — tombol Generate duduk di kaki panel dalam keadaan
 * hidup dan tak berubah, dan blok ini tanpa ikon peringatan maupun warna alarm.
 * Kalimat itu menjawab salah paham yang tidak pernah ada, dengan bayaran tiga
 * baris di kolom yang lebarnya bisa turun sampai 320 px.
 *
 * **Tanpa kalimat pengantar sama sekali.** Eyebrow, hitungan "N belum ada", dan
 * nama dokumen di tiap kartu sudah memikul seluruh maknanya; prosa apa pun di
 * antaranya hanya mengulang. Yang ikut hilang: keterangan bahwa pemeriksaannya
 * bersandar nama berkas — jadi saat ia keliru karena sebuah berkas dinamai tak
 * terduga, tidak ada yang menerangkan kenapa. Itu pertukaran yang diambil
 * sadar, dan §12.1b mencatatnya.
 *
 * **Nadanya netral, bukan peringatan.** `docs/application_flow.md:832` mencatat
 * kenapa panel "Perlu Perhatian" tidak boleh diperluas: ia merender tiap baris
 * dengan ikon peringatan tanpa konsep severity, sehingga kabar baik pun terbaca
 * sebagai alarm. Daftar "dokumen yang belum Anda punya" cuma berjarak satu kata
 * dari omelan, jadi: `SparkleIcon` — kosakata yang sama dengan tombol Generate
 * dan pil AI di riwayat draft — bukan `WarningCircleIcon`; `bg-muted`, bukan
 * destructive maupun amber; dan tanpa kata *wajib*, *harus*, *kurang*, atau
 * *belum memenuhi*. Kata kerjanya `bertumpu pada`, yang memerikan babnya, bukan
 * penggunanya.
 *
 * **Severity dibawa kata dan urutan, bukan warna.** Kebutuhan yang bersandar
 * tabel LKPS naik ke atas dan `jejak`-nya selalu berbunyi "angka indikator,
 * bukan narasi" — itu seluruh argumen indikator kuantitatif dalam empat kata,
 * dan pembacanya belajar bedanya dari dua kartu tanpa bahasa visual baru.
 *
 * **Yang sengaja tidak ada:** keadaan "semua terpenuhi". Pencocokannya
 * bersandar nama berkas dan tidak cukup kuat untuk menyatakan itu, dan baris
 * hijau permanen akan menyewa ruang checklist selamanya. Hadiah karena memenuhi
 * daftarnya adalah mendapatkan ruangnya kembali — sama seperti
 * `AssessmentBabBanner` yang juga memilih `null` ketimbang keadaan kosong.
 */
export function ChapterEvidenceSuggestion({
	saran,
	bisaUnggah,
	dimatikan,
	onUnggah,
}: {
	saran: RekomendasiBukti[];
	/** Menentukan kaki blok: tombol unggah, atau kalimat penunjuk. */
	bisaUnggah: boolean;
	/** `true` selagi generate berjalan; blok tetap terbaca, tombolnya mati. */
	dimatikan: boolean;
	onUnggah: () => void;
}) {
	const [selebihnyaTerbuka, setSelebihnyaTerbuka] = React.useState(false);

	if (saran.length === 0) return null;

	const utama = saran.slice(0, TAMPIL_AWAL);
	const selebihnya = saran.slice(TAMPIL_AWAL);

	return (
		<div className="mt-1 mb-2 border-b border-border pb-3">
			<div className="flex items-baseline justify-between gap-2">
				<p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					<SparkleIcon className="size-3.5" />
					Rekomendasi AI
				</p>
				<p className="shrink-0 text-xs text-muted-foreground tabular-nums">
					{saran.length} belum ada
				</p>
			</div>

			<ul className="mt-2 space-y-1.5">
				{utama.map((butir) => (
					<KartuSaran key={butir.kunci} butir={butir} />
				))}
			</ul>

			{selebihnya.length > 0 && (
				<>
					<button
						type="button"
						onClick={() => setSelebihnyaTerbuka((terbuka) => !terbuka)}
						aria-expanded={selebihnyaTerbuka}
						aria-controls="saran-bukti-selebihnya"
						className="mt-1.5 flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
					>
						<CaretDownIcon
							className={
								selebihnyaTerbuka
									? 'size-3 shrink-0 rotate-180 transition-transform'
									: 'size-3 shrink-0 transition-transform'
							}
						/>
						{selebihnyaTerbuka
							? 'Sembunyikan'
							: `${selebihnya.length} kebutuhan lain`}
					</button>

					{/*
					 * Tetap terpasang saat dilipat, bukan dilepas dari pohon: tombol di
					 * atas menunjuknya lewat `aria-controls`, dan acuan ke elemen yang
					 * tidak ada membuat pola disclosure-nya tidak bisa diikuti pembaca
					 * layar — aturan yang sama dipakai textarea prompt di kaki tab ini.
					 */}
					<ul
						id="saran-bukti-selebihnya"
						hidden={!selebihnyaTerbuka}
						className="mt-1.5 space-y-1.5"
					>
						{selebihnya.map((butir) => (
							<KartuSaran key={butir.kunci} butir={butir} />
						))}
					</ul>
				</>
			)}

			{bisaUnggah ? (
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onUnggah}
					disabled={dimatikan}
					className="mt-2.5 w-full cursor-pointer"
				>
					<UploadSimpleIcon />
					Unggah sekarang
				</Button>
			) : (
				/*
				 * §1 menyembunyikan aksi yang tidak boleh dipakai, bukan keterangannya.
				 * Daftarnya tetap utuh — bagi Penjamin Mutu yang sedang meninjau,
				 * "bukti mana yang hilang" justru lebih berguna daripada bagi
				 * penulisnya — yang hilang cuma tombolnya.
				 */
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					Berkas ini perlu diunggah oleh yang berhak di program studi ini.
				</p>
			)}
		</div>
	);
}

/**
 * Satu kebutuhan sebagai kartu tersendiri, bukan butir daftar polos: deretan
 * yang tiap barisnya dua baris teks akan menyatu jadi paragraf kalau tidak
 * dipisahkan bingkainya sendiri.
 *
 * Isinya berhenti di dua baris. `deskripsi` kriteria yang utuh 60–90 karakter —
 * tiga baris di kolom 320 px — dan kartunya berhenti bisa dipindai; dampak skor
 * dan level rubriknya sudah jadi urusan tab Review, dan mengulangnya di sini
 * menciptakan dua tempat yang bisa berselisih.
 */
function KartuSaran({ butir }: { butir: RekomendasiBukti }) {
	return (
		<li className="rounded-md border border-border bg-muted/40 p-2.5">
			<p className="text-sm leading-tight font-medium">{butir.nama}</p>
			<p className="mt-1 text-xs text-muted-foreground">{butir.jejak}</p>
		</li>
	);
}
