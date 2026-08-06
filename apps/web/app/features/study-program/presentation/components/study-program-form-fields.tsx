import { type FieldErrors, type UseFormRegister } from 'react-hook-form';

import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from '~/core/components/ui/field';
import { Input } from '~/core/components/ui/input';
import { Select } from '~/core/components/ui/select';
import { type CreateStudyProgramDto } from '../../domain/dtos/create-study-program.dto';
import {
	jenjangEnum,
	PERINGKAT_AKREDITASI_LABEL,
	peringkatAkreditasiEnum,
} from '../../domain/entities/study-program.entity';

/**
 * Isian formulir prodi, dipakai bersama oleh halaman tambah dan ubah.
 *
 * Disatukan karena keduanya memang meminta hal yang sama persis: identitas
 * akreditasi punya delapan field, dan menyalinnya dua kali berarti setiap
 * penambahan field ke depan harus diingat di dua tempat.
 */
export function StudyProgramFormFields({
	register,
	errors,
	disabled,
}: {
	register: UseFormRegister<CreateStudyProgramDto>;
	errors: FieldErrors<CreateStudyProgramDto>;
	disabled: boolean;
}) {
	return (
		<FieldGroup>
			<Field data-invalid={!!errors.studyProgramName}>
				<FieldLabel htmlFor="studyProgramName">Nama Program Studi</FieldLabel>
				<Input
					id="studyProgramName"
					placeholder="Contoh: Teknik Informatika"
					disabled={disabled}
					{...register('studyProgramName')}
				/>
				{errors.studyProgramName && (
					<FieldError>{errors.studyProgramName.message}</FieldError>
				)}
			</Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field data-invalid={!!errors.jenjang}>
					<FieldLabel htmlFor="jenjang">Jenjang</FieldLabel>
					<Select id="jenjang" disabled={disabled} {...register('jenjang')}>
						{jenjangEnum.options.map((jenjang) => (
							<option key={jenjang} value={jenjang}>
								{jenjang}
							</option>
						))}
					</Select>
					{errors.jenjang && <FieldError>{errors.jenjang.message}</FieldError>}
				</Field>

				<Field data-invalid={!!errors.kode}>
					<FieldLabel htmlFor="kode">Kode Prodi</FieldLabel>
					<Input
						id="kode"
						placeholder="Contoh: 55201"
						disabled={disabled}
						{...register('kode')}
					/>
					{errors.kode && <FieldError>{errors.kode.message}</FieldError>}
				</Field>
			</div>

			<Field data-invalid={!!errors.fakultas}>
				<FieldLabel htmlFor="fakultas">Fakultas</FieldLabel>
				<Input
					id="fakultas"
					placeholder="Contoh: Fakultas Teknik"
					disabled={disabled}
					{...register('fakultas')}
				/>
				{errors.fakultas && <FieldError>{errors.fakultas.message}</FieldError>}
			</Field>

			<Field data-invalid={!!errors.ketuaProdi}>
				<FieldLabel htmlFor="ketuaProdi">Ketua Program Studi</FieldLabel>
				<Input
					id="ketuaProdi"
					placeholder="Contoh: Dr. Andi Nugroho, S.T., M.Kom."
					disabled={disabled}
					{...register('ketuaProdi')}
				/>
				{errors.ketuaProdi && (
					<FieldError>{errors.ketuaProdi.message}</FieldError>
				)}
			</Field>

			<Field data-invalid={!!errors.peringkatAkreditasi}>
				<FieldLabel htmlFor="peringkatAkreditasi">
					Peringkat Akreditasi
				</FieldLabel>
				<Select
					id="peringkatAkreditasi"
					disabled={disabled}
					{...register('peringkatAkreditasi')}
				>
					{peringkatAkreditasiEnum.options.map((peringkat) => (
						<option key={peringkat} value={peringkat}>
							{PERINGKAT_AKREDITASI_LABEL[peringkat]}
						</option>
					))}
				</Select>
				{errors.peringkatAkreditasi && (
					<FieldError>{errors.peringkatAkreditasi.message}</FieldError>
				)}
			</Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field data-invalid={!!errors.nomorSkAkreditasi}>
					<FieldLabel htmlFor="nomorSkAkreditasi">
						Nomor SK Akreditasi
					</FieldLabel>
					<Input
						id="nomorSkAkreditasi"
						placeholder="Kosongkan bila belum terakreditasi"
						disabled={disabled}
						{...register('nomorSkAkreditasi')}
					/>
					{errors.nomorSkAkreditasi && (
						<FieldError>{errors.nomorSkAkreditasi.message}</FieldError>
					)}
				</Field>

				<Field data-invalid={!!errors.berlakuSampaiAkreditasi}>
					<FieldLabel htmlFor="berlakuSampaiAkreditasi">
						Berlaku Sampai
					</FieldLabel>
					<Input
						id="berlakuSampaiAkreditasi"
						type="date"
						disabled={disabled}
						{...register('berlakuSampaiAkreditasi')}
					/>
					{errors.berlakuSampaiAkreditasi && (
						<FieldError>{errors.berlakuSampaiAkreditasi.message}</FieldError>
					)}
				</Field>
			</div>
		</FieldGroup>
	);
}
