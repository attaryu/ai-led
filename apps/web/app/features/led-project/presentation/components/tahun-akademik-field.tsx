import { type UseFormRegisterReturn } from 'react-hook-form';

import { Field, FieldError, FieldLabel } from '~/core/components/ui/field';
import { Input } from '~/core/components/ui/input';
import { susunTahunAkademik } from '../../domain/entities/led-project.entity';

type TahunAkademikFieldProps = {
	/** Hasil `register('tahunMulai')` dari formulir yang memakainya. */
	registrasi: UseFormRegisterReturn;
	/** Isi kolom saat ini, dari `watch('tahunMulai')`; dipakai pratinjaunya. */
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
 * Pratinjau di sebelah kolom **bukan hiasan**, melainkan bagian inti idenya:
 * tanpa itu pengguna tidak punya cara tahu apakah yang diminta tahun awal atau
 * tahun akhir, dan yang bermaksud menyusun 2025/2026 lalu mengetik `2026` akan
 * meleset setahun tanpa pernah melihat kesalahannya. `aria-live` dipasang supaya
 * hasilnya ikut terbaca pembaca layar, bukan cuma terlihat.
 *
 * Satu komponen dipakai dua halaman supaya pesan dan pratinjaunya tidak bisa
 * berbeda antara formulir buat dan formulir ubah.
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
	const pratinjau = /^\d{4}$/.test(nilai ?? '')
		? susunTahunAkademik(Number(nilai))
		: null;

	return (
		<Field data-invalid={!!pesanGalat}>
			<FieldLabel htmlFor="tahunMulai">Tahun Akademik</FieldLabel>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<Input
					id="tahunMulai"
					inputMode="numeric"
					autoComplete="off"
					maxLength={4}
					placeholder="2025"
					className="w-24"
					disabled={disabled}
					{...registrasi}
				/>
				<span className="text-sm text-muted-foreground" aria-live="polite">
					{pratinjau ? (
						<>
							Tahun akademik{' '}
							<span className="font-medium text-foreground">{pratinjau}</span>
						</>
					) : (
						'Isi tahun mulainya saja — 2025 berarti 2025/2026'
					)}
				</span>
			</div>
			{pesanGalat && <FieldError>{pesanGalat}</FieldError>}
		</Field>
	);
}
