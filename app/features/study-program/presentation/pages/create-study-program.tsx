import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '~/core/components/ui/card';
import { fromDateInputValue } from '~/core/lib/format-time';
import {
	createStudyProgramSchema,
	type CreateStudyProgramDto,
} from '../../domain/dtos/create-study-program.dto';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';
import { studyProgramRepository } from '../../data/repositories/study-program.repository';
import { StudyProgramFormFields } from '../components/study-program-form-fields';

export function CreateStudyProgram() {
	const navigate = useNavigate();

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<CreateStudyProgramDto>({
		resolver: zodResolver(createStudyProgramSchema),
		defaultValues: {
			studyProgramName: '',
			kode: '',
			jenjang: 'S1',
			fakultas: '',
			ketuaProdi: '',
			peringkatAkreditasi: 'BELUM_TERAKREDITASI',
			nomorSkAkreditasi: '',
			berlakuSampaiAkreditasi: '',
		},
	});

	const onSubmit = (data: CreateStudyProgramDto) => {
		const newProgram: StudyProgramEntity = {
			...data,
			id: Date.now().toString(),
			nomorSkAkreditasi: data.nomorSkAkreditasi.trim() || null,
			berlakuSampaiAkreditasi: fromDateInputValue(
				data.berlakuSampaiAkreditasi,
			),
			createdAt: new Date().toISOString(),
		};

		// Lewat repository, bukan localStorage langsung: dengan identitas
		// akreditasi ikut disimpan, jalan pintas itu jadi tempat field baru
		// gampang terlupakan.
		studyProgramRepository.create(newProgram);
		navigate('/dashboard/study-programs');
	};

	return (
		<div className="flex flex-col gap-6 max-w-2xl mx-auto">
			<div className="flex items-center gap-4">
				<Button
					variant="outline"
					size="icon"
					onClick={() => navigate('/dashboard/study-programs')}
				>
					<ArrowLeftIcon className="size-4" />
				</Button>
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Tambah Program Studi Baru
					</h2>
					<p className="text-sm text-muted-foreground">
						Masukkan identitas Program Studi beserta akreditasi yang berlaku.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Formulir Program Studi</CardTitle>
					<CardDescription>
						Nomor SK dan masa berlaku boleh dikosongkan bila prodi belum
						terakreditasi. Tekan simpan jika sudah selesai.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<StudyProgramFormFields
							register={register}
							errors={errors}
							disabled={isSubmitting}
						/>

						<div className="pt-4 border-t border-border flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => navigate('/dashboard/study-programs')}
							>
								Batal
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? 'Menyimpan...' : 'Simpan'}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
