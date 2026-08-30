import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams, useSearchParams } from 'react-router';
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
import { Card, CardContent } from '~/core/components/ui/card';
import { fromDateInputValue, toDateInputValue } from '~/core/lib/format-time';
import { safeReturnTo } from '~/core/lib/utils';
import {
	updateLedProjectSchema,
	type UpdateLedProjectDto,
} from '../../domain/dtos/update-led-project.dto';
import {
	adaTahunAkademikGanda,
	type LedProjectEntity,
	susunTahunAkademik,
	tahunMulaiDari,
} from '../../domain/entities/led-project.entity';
import { TahunAkademikField } from '../components/tahun-akademik-field';
import { ledProjectRepository } from '../../data/repositories/led-project.repository';
import { type StudyProgramEntity } from '../../../study-program/domain/entities/study-program.entity';
import { studyProgramRepository } from '../../../study-program/data/repositories/study-program.repository';

export function EditLedProject() {
	const navigate = useNavigate();
	const { projectId } = useParams<{ projectId: string }>();
	const [searchParams] = useSearchParams();
	const [project, setProject] = React.useState<LedProjectEntity | null>(null);

	/*
	 * Formulir ini bisa dibuka dari daftar lintas program studi maupun dari daftar milik
	 * satu prodi (§5.3); yang kedua menitipkan tujuan pulangnya lewat query
	 * string supaya Penjamin Mutu tidak terlempar ke lapis tenant.
	 */
	const returnTo = safeReturnTo(
		searchParams.get('returnTo'),
		'/dashboard/led-projects',
	);
	const [studyPrograms, setStudyPrograms] = React.useState<StudyProgramEntity[]>([]);

	React.useEffect(() => {
		setStudyPrograms(studyProgramRepository.findAll());
		if (projectId) {
			const found = ledProjectRepository.findById(projectId);
			if (found) {
				setProject(found);
			} else {
				alert('Dokumen LED tidak ditemukan!');
				navigate(returnTo);
			}
		}
	}, [projectId, navigate, returnTo]);

	const {
		register,
		handleSubmit,
		reset,
		setError,
		watch,
		formState: { errors, isSubmitting },
	} = useForm<UpdateLedProjectDto>({
		resolver: zodResolver(updateLedProjectSchema),
		defaultValues: {
			studyProgramId: '',
			judul: '',
			tahunMulai: '',
			statusKeseluruhan: 'DRAFT',
			tenggat: '',
		},
	});

	React.useEffect(() => {
		if (project) {
			reset({
				studyProgramId: project.studyProgramId,
				judul: project.judul,
				tahunMulai: tahunMulaiDari(project.tahunAkademik),
				statusKeseluruhan: project.statusKeseluruhan,
				tenggat: toDateInputValue(project.tenggat),
			});
		}
	}, [project, reset]);

	const onSubmit = (data: UpdateLedProjectDto) => {
		if (!projectId) return;

		const prodi = studyPrograms.find((p) => p.id === data.studyProgramId);
		if (!prodi) {
			alert('Program studi tidak valid.');
			return;
		}

		const tahunAkademik = susunTahunAkademik(Number(data.tahunMulai));

		/*
		 * `kecualiId` supaya dokumen ini tidak dianggap bentrok dengan dirinya
		 * sendiri saat yang diubah cuma judul atau tenggat.
		 */
		if (
			adaTahunAkademikGanda(ledProjectRepository.findAll(), {
				studyProgramId: data.studyProgramId,
				tahunAkademik,
				kecualiId: projectId,
			})
		) {
			setError('tahunMulai', {
				message: `${prodi.studyProgramName} sudah punya Dokumen LED lain untuk tahun akademik ${tahunAkademik}`,
			});
			return;
		}

		ledProjectRepository.update(projectId, {
			studyProgramId: data.studyProgramId,
			studyProgramName: prodi.studyProgramName,
			judul: data.judul,
			tahunAkademik,
			statusKeseluruhan: data.statusKeseluruhan,
			tenggat: fromDateInputValue(data.tenggat),
		});

		window.dispatchEvent(new Event('storage-update'));
		navigate(returnTo);
	};

	if (!project) {
		return <div className="p-8 text-center text-muted-foreground">Memuat data Dokumen LED...</div>;
	}

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
						Edit Dokumen LED
					</h2>
				</div>
			</div>

			{/* Lihat catatan di create-led-project.tsx soal CardHeader yang dibuang. */}
			<Card>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<FieldGroup>
							<Field data-invalid={!!errors.studyProgramId}>
								<FieldLabel htmlFor="studyProgramId">
									Program Studi
								</FieldLabel>
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
								{errors.studyProgramId && (
									<FieldError>{errors.studyProgramId.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!errors.judul}>
								<FieldLabel htmlFor="judul">
									Judul Dokumen LED
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

							<Field data-invalid={!!errors.statusKeseluruhan}>
								<FieldLabel htmlFor="statusKeseluruhan">
									Status dokumen
								</FieldLabel>
								<Select
									id="statusKeseluruhan"
									disabled={isSubmitting}
									{...register('statusKeseluruhan')}
								>
									<option value="DRAFT">DRAFT</option>
									<option value="REVIEW">REVIEW</option>
									<option value="SELESAI">SELESAI</option>
								</Select>
								{errors.statusKeseluruhan && (
									<FieldError>{errors.statusKeseluruhan.message}</FieldError>
								)}
							</Field>

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
							<Button type="submit" disabled={isSubmitting} className="cursor-pointer">
								{isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
