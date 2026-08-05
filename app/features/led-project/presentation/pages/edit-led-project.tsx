import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router';
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
import { fromDateInputValue, toDateInputValue } from '~/core/lib/format-time';
import {
	updateLedProjectSchema,
	type UpdateLedProjectDto,
} from '../../domain/dtos/update-led-project.dto';
import { type LedProjectEntity } from '../../domain/entities/led-project.entity';
import { ledProjectRepository } from '../../data/repositories/led-project.repository';
import { type StudyProgramEntity } from '../../../study-program/domain/entities/study-program.entity';
import { studyProgramRepository } from '../../../study-program/data/repositories/study-program.repository';

export function EditLedProject() {
	const navigate = useNavigate();
	const { projectId } = useParams<{ projectId: string }>();
	const [project, setProject] = React.useState<LedProjectEntity | null>(null);
	const [studyPrograms, setStudyPrograms] = React.useState<StudyProgramEntity[]>([]);

	React.useEffect(() => {
		setStudyPrograms(studyProgramRepository.findAll());
		if (projectId) {
			const found = ledProjectRepository.findById(projectId);
			if (found) {
				setProject(found);
			} else {
				alert('Proyek LED tidak ditemukan!');
				navigate('/dashboard/led-projects');
			}
		}
	}, [projectId, navigate]);

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<UpdateLedProjectDto>({
		resolver: zodResolver(updateLedProjectSchema),
		defaultValues: {
			studyProgramId: '',
			judul: '',
			tahunAkademik: '',
			statusKeseluruhan: 'DRAFT',
			tenggat: '',
		},
	});

	React.useEffect(() => {
		if (project) {
			reset({
				studyProgramId: project.studyProgramId,
				judul: project.judul,
				tahunAkademik: project.tahunAkademik,
				statusKeseluruhan: project.statusKeseluruhan,
				tenggat: toDateInputValue(project.tenggat),
			});
		}
	}, [project, reset]);

	const onSubmit = (data: UpdateLedProjectDto) => {
		if (!projectId) return;

		const prodi = studyPrograms.find((p) => p.id === data.studyProgramId);
		if (!prodi) {
			alert('Program Studi tidak valid!');
			return;
		}

		ledProjectRepository.update(projectId, {
			studyProgramId: data.studyProgramId,
			studyProgramName: prodi.studyProgramName,
			judul: data.judul,
			tahunAkademik: data.tahunAkademik,
			statusKeseluruhan: data.statusKeseluruhan,
			tenggat: fromDateInputValue(data.tenggat),
		});

		window.dispatchEvent(new Event('storage-update'));
		navigate('/dashboard/led-projects');
	};

	if (!project) {
		return <div className="p-8 text-center text-muted-foreground">Memuat data Proyek LED...</div>;
	}

	return (
		<div className="flex flex-col gap-6 max-w-2xl mx-auto">
			<div className="flex items-center gap-4">
				<Button
					variant="outline"
					size="icon"
					onClick={() => navigate('/dashboard/led-projects')}
					className="cursor-pointer"
				>
					<ArrowLeftIcon className="size-4" />
				</Button>
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Edit Proyek LED
					</h2>
					<p className="text-sm text-muted-foreground">
						Ubah detail Proyek LED di bawah ini.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Formulir Proyek LED</CardTitle>
					<CardDescription>
						Ubah detail Proyek LED. Tekan simpan jika sudah selesai.
					</CardDescription>
				</CardHeader>
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

							<Field data-invalid={!!errors.tahunAkademik}>
								<FieldLabel htmlFor="tahunAkademik">
									Tahun Akademik
								</FieldLabel>
								<Input
									id="tahunAkademik"
									placeholder="Contoh: 2025/2026"
									disabled={isSubmitting}
									{...register('tahunAkademik')}
								/>
								{errors.tahunAkademik && (
									<FieldError>{errors.tahunAkademik.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!errors.statusKeseluruhan}>
								<FieldLabel htmlFor="statusKeseluruhan">
									Status Proyek
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
								onClick={() => navigate('/dashboard/led-projects')}
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
