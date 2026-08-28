import {
	type FieldErrors,
	type UseFormRegister,
} from 'react-hook-form';

import { Input } from '~/core/components/ui/input';
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from '~/core/components/ui/field';
import { type CreateAccreditationSetDto } from '../../domain/dtos/create-accreditation-set.dto';

/**
 * Identitas set, dipakai bersama oleh formulir buat dan halaman detail —
 * bentuk DTO keduanya memang sama persis, jadi menuliskannya dua kali hanya
 * membuka peluang aturannya menyimpang.
 */
export function AccreditationSetFormFields({
	register,
	errors,
	disabled,
}: {
	register: UseFormRegister<CreateAccreditationSetDto>;
	errors: FieldErrors<CreateAccreditationSetDto>;
	disabled?: boolean;
}) {
	return (
		<FieldGroup>
			<Field data-invalid={!!errors.nama}>
				<FieldLabel htmlFor="nama">Nama Set</FieldLabel>
				<Input
					id="nama"
					placeholder="Contoh: LAM-Teknik 2026"
					disabled={disabled}
					{...register('nama')}
				/>
				<FieldDescription>
					Nama yang muncul saat proyek memilih acuan penilaiannya.
				</FieldDescription>
				{errors.nama && <FieldError>{errors.nama.message}</FieldError>}
			</Field>

			<Field data-invalid={!!errors.lembaga}>
				<FieldLabel htmlFor="lembaga">Lembaga Penilai</FieldLabel>
				<Input
					id="lembaga"
					placeholder="Contoh: LAM Teknik"
					disabled={disabled}
					{...register('lembaga')}
				/>
				{errors.lembaga && <FieldError>{errors.lembaga.message}</FieldError>}
			</Field>

			<Field data-invalid={!!errors.tahunSiklus}>
				<FieldLabel htmlFor="tahunSiklus">Tahun Siklus</FieldLabel>
				<Input
					id="tahunSiklus"
					type="number"
					placeholder="2026"
					disabled={disabled}
					// `valueAsNumber` supaya nilainya sampai ke skema sebagai angka —
					// aturan rentang tahun hidup di entity, dan input HTML selalu
					// memberi string.
					{...register('tahunSiklus', { valueAsNumber: true })}
				/>
				{errors.tahunSiklus && (
					<FieldError>{errors.tahunSiklus.message}</FieldError>
				)}
			</Field>
		</FieldGroup>
	);
}
