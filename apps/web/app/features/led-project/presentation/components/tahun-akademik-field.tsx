import { type UseFormRegisterReturn } from 'react-hook-form';

import { Field, FieldError, FieldLabel } from '~/core/components/ui/field';
import { Input } from '~/core/components/ui/input';

type TahunAkademikFieldProps = {
	/** Hasil `register('tahunMulai')` dari formulir yang memakainya. */
	registrasi: UseFormRegisterReturn;
	/** Isi kolom saat ini, dari `watch('tahunMulai')`; dipakai tahun akhirnya. */
	nilai: string;
	pesanGalat?: string;
	disabled?: boolean;
};

/**
 * Kolom "Tahun Akademik" untuk formulir buat maupun ubah Dokumen LED (§5.3).
 *
 * Yang diketik **satu angka tahun mulai**, bukan `2025/2026`. Tahun akhirnya
 * disusun `susunTahunAkademik` saat submit, sehingga tahun kembar (`2026/2026`)
 * dan urutan mundur (`2030/2020`) tidak mungkin terbentuk — sebelumnya keduanya
 * lolos karena validasi hanya memeriksa bentuk tulisannya.
 *
 * Tahun akhir ditampilkan sebagai teks biasa di ujung kanan kolomnya, di
 * seberang garis miring, sehingga terbaca sebagai satu nilai utuh: `2025 / 2026`.
 * Ditaruh di dalam kolom, bukan di sebelahnya, supaya lebarnya tetap sama dengan
 * kolom lain di formulir yang sama — kolom sempit di antara kolom penuh terbaca
 * seperti kolom yang salah bentuk. Bentuk itu sendiri
 * yang menjelaskan mana yang diisi dan mana yang dihitung — tidak perlu kalimat
 * penjelas maupun contoh, yang justru menambah teks tanpa menambah kejelasan.
 * `aria-live` dipasang supaya tahun akhirnya ikut terbaca pembaca layar saat
 * berubah, bukan cuma terlihat.
 *
 * Satu komponen dipakai dua halaman supaya bentuknya tidak bisa berbeda antara
 * formulir buat dan formulir ubah.
 *
 * Yang sengaja tidak ada: kolom kedua untuk tahun akhir. Selama tahun akademik
 * selalu dua tahun berurutan, kolom itu cuma punya satu jawaban benar — bukan
 * isian, melainkan ujian. Kalau ternyata ada penulisan tidak berurutan, di
 * sinilah kolom keduanya ditambahkan, dan penyimpanannya tidak perlu berubah.
 */
export function TahunAkademikField({
	registrasi,
	nilai,
	pesanGalat,
	disabled,
}: TahunAkademikFieldProps) {
	// Em dash saat isian belum berupa empat angka — menjaga lebar barisnya tetap
	// sama saat mengetik, sekaligus menandai tahun akhirnya belum bisa dihitung.
	const tahunAkhir = /^\d{4}$/.test(nilai ?? '') ? Number(nilai) + 1 : null;

	return (
		<Field data-invalid={!!pesanGalat}>
			<FieldLabel htmlFor="tahunMulai">Tahun Akademik</FieldLabel>
			<div className="relative">
				<Input
					id="tahunMulai"
					inputMode="numeric"
					autoComplete="off"
					maxLength={4}
					// `pr-20` menyisakan ruang untuk sufiksnya supaya angka yang diketik
					// tidak pernah tertimpa; sisanya biarkan `w-full` bawaan `Input`,
					// sehingga kolom ini selebar kolom lain di formulir yang sama.
					className="pr-20 tabular-nums"
					disabled={disabled}
					{...registrasi}
				/>
				{/* `pointer-events-none` supaya klik di area sufiks tetap jatuh ke
				    kolomnya, bukan ke teks yang tidak bisa disunting. */}
				<span
					className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center gap-1.5 text-sm"
					aria-live="polite"
				>
					<span className="text-muted-foreground">/</span>
					<span className="tabular-nums text-foreground">
						{tahunAkhir ?? '—'}
					</span>
				</span>
			</div>
			{pesanGalat && <FieldError>{pesanGalat}</FieldError>}
		</Field>
	);
}
