import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Input } from '~/core/components/ui/input';
import { Select } from '~/core/components/ui/select';
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from '~/core/components/ui/field';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '~/core/components/ui/card';
import { ApiError } from '~/core/lib/api-client';
import { fromDateInputValue } from '~/core/lib/format-time';
import { safeReturnTo } from '~/core/lib/utils';
import {
	createLedProjectSchema,
	type CreateLedProjectDto,
} from '../../domain/dtos/create-led-project.dto';
import {
	adaTahunAkademikGanda,
	susunTahunAkademik,
} from '../../domain/entities/led-project.entity';
import { TahunAkademikField } from '../components/tahun-akademik-field';
import { ledProjectRepository } from '../../data/repositories/led-project.repository';
import { type StudyProgramEntity } from '../../../study-program/domain/entities/study-program.entity';
import { studyProgramRepository } from '../../../study-program/data/repositories/study-program.repository';

export function CreateLedProject() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [studyPrograms, setStudyPrograms] = React.useState<StudyProgramEntity[]>([]);
	const [formError, setFormError] = React.useState<string | null>(null);

	/*
	 * Formulir ini bisa dibuka dari dua tempat: daftar lintas prodi di lapis
	 * tenant, dan daftar milik satu prodi di lapis prodi (§5.3). Yang kedua sudah
	 * tahu prodinya dan berhak kembali ke tempatnya semula, jadi keduanya
	 * dititipkan lewat query string alih-alih membuat rute pembuatan kedua.
	 */
	const prodiTerpilih = searchParams.get('studyProgramId');
	const returnTo = safeReturnTo(
		searchParams.get('returnTo'),
		'/dashboard/led-projects',
	);

	React.useEffect(() => {
		studyProgramRepository.findAll().then(setStudyPrograms);
	}, []);

	const {
		register,
		handleSubmit,
		setValue,
		setError,
		watch,
		formState: { errors, isSubmitting },
	} = useForm<CreateLedProjectDto>({
		resolver: zodResolver(createLedProjectSchema),
		defaultValues: {
			studyProgramId: '',
			judul: '',
			tahunMulai: '',
			tenggat: '',
		},
	});

	React.useEffect(() => {
		if (studyPrograms.length === 0) return;

		// Prodi dari URL menang selama ia benar-benar ada; kalau tautannya
		// menyebut prodi yang sudah dihapus, jatuh ke pilihan pertama seperti biasa.
		const adaDiDaftar = studyPrograms.some((p) => p.id === prodiTerpilih);
		setValue(
			'studyProgramId',
			adaDiDaftar ? prodiTerpilih! : studyPrograms[0].id,
		);
	}, [studyPrograms, prodiTerpilih, setValue]);

	const onSubmit = async (data: CreateLedProjectDto) => {
		const prodi = studyPrograms.find((p) => p.id === data.studyProgramId);
		if (!prodi) {
			alert('Program Studi tidak valid!');
			return;
		}

		const tahunAkademik = susunTahunAkademik(Number(data.tahunMulai));

		/*
		 * Ditegakkan di sini, bukan di repository, supaya pesannya menempel ke
		 * kolom tahun alih-alih muncul sebagai `alert` lepas. Lihat alasan
		 * kenapa duplikat berbahaya di `adaTahunAkademikGanda`.
		 */
		if (
			adaTahunAkademikGanda(await ledProjectRepository.findAll(), {
				studyProgramId: data.studyProgramId,
				tahunAkademik,
			})
		) {
			setError('tahunMulai', {
				message: `${prodi.studyProgramName} sudah punya Dokumen LED untuk tahun akademik ${tahunAkademik}`,
			});
			return;
		}

		setFormError(null);
		try {
			// Lewat repository, bukan langsung: di sanalah struktur bab standar ikut
			// dibuat untuk dokumen baru ini (§7.3).
			await ledProjectRepository.create({
				studyProgramId: data.studyProgramId,
				judul: data.judul,
				tahunAkademik,
				tenggat: fromDateInputValue(data.tenggat),
			});
			navigate(returnTo);
		} catch (e) {
			setFormError(e instanceof ApiError ? e.message : 'Gagal menyimpan Proyek LED.');
		}
	};

	return (
		<div className="flex flex-col gap-6 max-w-2xl mx-auto">
			<div className="flex items-center gap-4">
				<Button
					variant="outline"
					size="icon"
					onClick={() => navigate(returnTo)}
					className="cursor-pointer"
				>
					<ArrowLeftIcon className="size-4" />
				</Button>
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Tambah Proyek LED Baru
					</h2>
					<p className="text-sm text-muted-foreground">
						Buat proyek penyusunan Laporan Evaluasi Diri (LED) baru.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Formulir Proyek LED</CardTitle>
					<CardDescription>
						Masukkan detail Proyek LED baru. Tekan simpan jika sudah selesai.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<FieldGroup>
							{formError && (
								<p className="text-sm text-destructive">{formError}</p>
							)}
							<Field data-invalid={!!errors.studyProgramId}>
								<FieldLabel htmlFor="studyProgramId">
									Program Studi
								</FieldLabel>
								{studyPrograms.length === 0 ? (
									<div className="text-sm text-destructive border border-destructive/20 bg-destructive/10 rounded-md p-3">
										Belum ada Program Studi terdaftar. Silakan buat Program Studi terlebih dahulu.
									</div>
								) : (
									<Select
										id="studyProgramId"
										disabled={isSubmitting}
										{...register('studyProgramId')}
									>
										{studyPrograms.map((p) => (
											<option key={p.id} value={p.id}>
												{p.studyProgramName}
											</option>
										))}
									</Select>
								)}
								{errors.studyProgramId && (
									<FieldError>{errors.studyProgramId.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!errors.judul}>
								<FieldLabel htmlFor="judul">
									Judul Proyek LED
								</FieldLabel>
								<Input
									id="judul"
									placeholder="Contoh: Akreditasi LED Teknik Informatika 2026"
									disabled={isSubmitting}
									{...register('judul')}
								/>
								{errors.judul && (
									<FieldError>{errors.judul.message}</FieldError>
								)}
							</Field>

							<TahunAkademikField
								registrasi={register('tahunMulai')}
								nilai={watch('tahunMulai')}
								pesanGalat={errors.tahunMulai?.message}
								disabled={isSubmitting}
							/>

							<Field data-invalid={!!errors.tenggat}>
								<FieldLabel htmlFor="tenggat">
									Target Selesai (opsional)
								</FieldLabel>
								<Input
									id="tenggat"
									type="date"
									disabled={isSubmitting}
									{...register('tenggat')}
								/>
								{errors.tenggat && (
									<FieldError>{errors.tenggat.message}</FieldError>
								)}
							</Field>
						</FieldGroup>

						<div className="pt-4 border-t border-border flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => navigate(returnTo)}
							>
								Batal
							</Button>
							<Button type="submit" disabled={isSubmitting || studyPrograms.length === 0} className="cursor-pointer">
								{isSubmitting ? 'Menyimpan...' : 'Simpan'}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
