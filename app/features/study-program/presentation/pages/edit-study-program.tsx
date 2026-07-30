import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import { Input } from '~/core/components/ui/input';
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
import {
	updateStudyProgramSchema,
	type UpdateStudyProgramDto,
} from '../../domain/dtos/update-study-program.dto';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';
import { studyProgramRepository } from '../../data/repositories/study-program.repository';

export function EditStudyProgram() {
	const navigate = useNavigate();
	const { programId } = useParams<{ programId: string }>();
	const [program, setProgram] = React.useState<StudyProgramEntity | null>(null);

	React.useEffect(() => {
		if (programId) {
			const found = studyProgramRepository.findById(programId);
			if (found) {
				setProgram(found);
			} else {
				alert('Program Studi tidak ditemukan!');
				navigate('/dashboard/study-programs');
			}
		}
	}, [programId, navigate]);

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<UpdateStudyProgramDto>({
		resolver: zodResolver(updateStudyProgramSchema),
		defaultValues: {
			studyProgramName: '',
		},
	});

	React.useEffect(() => {
		if (program) {
			reset({
				studyProgramName: program.studyProgramName,
			});
		}
	}, [program, reset]);

	const onSubmit = (data: UpdateStudyProgramDto) => {
		if (!programId) return;

		studyProgramRepository.update(programId, {
			studyProgramName: data.studyProgramName,
		});
		navigate('/dashboard/study-programs');
	};

	if (!program) {
		return <div className="p-8 text-center text-muted-foreground">Memuat data Program Studi...</div>;
	}

	return (
		<div className="flex flex-col gap-6 max-w-2xl mx-auto">
			<div className="flex items-center gap-4">
				<Button
					variant="outline"
					size="icon"
					onClick={() => navigate('/dashboard/study-programs')}
					className="cursor-pointer"
				>
					<ArrowLeftIcon className="size-4" />
				</Button>
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Edit Program Studi
					</h2>
					<p className="text-sm text-muted-foreground">
						Ubah nama Program Studi di bawah ini.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Formulir Program Studi</CardTitle>
					<CardDescription>
						Ubah nama Program Studi baru. Tekan simpan jika sudah selesai.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<FieldGroup>
							<Field data-invalid={!!errors.studyProgramName}>
								<FieldLabel htmlFor="studyProgramName">
									Nama Program Studi
								</FieldLabel>
								<Input
									id="studyProgramName"
									placeholder="Contoh: Teknik Informatika"
									disabled={isSubmitting}
									{...register('studyProgramName')}
								/>
								{errors.studyProgramName && (
									<FieldError>{errors.studyProgramName.message}</FieldError>
								)}
							</Field>
						</FieldGroup>

						<div className="pt-4 border-t border-border flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => navigate('/dashboard/study-programs')}
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
