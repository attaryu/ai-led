import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react';

import { PlaceholderPage } from '~/core/components/placeholder-page';
import { Button } from '~/core/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '~/core/components/ui/card';
import { ApiError } from '~/core/lib/api-client';
import { fromDateInputValue, toDateInputValue } from '~/core/lib/format-time';
import {
	updateStudyProgramSchema,
	type UpdateStudyProgramDto,
} from '../../domain/dtos/update-study-program.dto';
import { type StudyProgramEntity } from '../../domain/entities/study-program.entity';
import { studyProgramRepository } from '../../data/repositories/study-program.repository';
import { StudyProgramFormFields } from '../components/study-program-form-fields';

export function EditStudyProgram() {
	const navigate = useNavigate();
	const { programId } = useParams<{ programId: string }>();
	const [program, setProgram] = React.useState<StudyProgramEntity | null>(null);
	const [formError, setFormError] = React.useState<string | null>(null);
	const [tidakAda, setTidakAda] = React.useState(false);

	React.useEffect(() => {
		if (!programId) return;
		let cancelled = false;
		studyProgramRepository.findById(programId).then((found) => {
			if (cancelled) return;
			if (found) {
				setProgram(found);
			} else {
				// Lihat catatan di edit-user.tsx soal kenapa ini bukan `alert`.
				setTidakAda(true);
			}
		});
		return () => {
			cancelled = true;
		};
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
			kode: '',
			jenjang: 'S1',
			fakultas: '',
			ketuaProdi: '',
			peringkatAkreditasi: 'BELUM_TERAKREDITASI',
			nomorSkAkreditasi: '',
			berlakuSampaiAkreditasi: '',
		},
	});

	React.useEffect(() => {
		if (program) {
			reset({
				studyProgramName: program.studyProgramName,
				kode: program.kode,
				jenjang: program.jenjang,
				fakultas: program.fakultas,
				ketuaProdi: program.ketuaProdi,
				peringkatAkreditasi: program.peringkatAkreditasi,
				nomorSkAkreditasi: program.nomorSkAkreditasi ?? '',
				berlakuSampaiAkreditasi: toDateInputValue(
					program.berlakuSampaiAkreditasi,
				),
			});
		}
	}, [program, reset]);

	const onSubmit = async (data: UpdateStudyProgramDto) => {
		if (!programId) return;
		setFormError(null);
		try {
			await studyProgramRepository.update(programId, {
				...data,
				nomorSkAkreditasi: data.nomorSkAkreditasi.trim() || null,
				berlakuSampaiAkreditasi: fromDateInputValue(
					data.berlakuSampaiAkreditasi,
				),
			});
			navigate('/dashboard/study-programs');
		} catch (e) {
			setFormError(e instanceof ApiError ? e.message : 'Gagal menyimpan perubahan.');
		}
	};

	if (tidakAda) {
		return (
			<PlaceholderPage
				title="Program studi tidak ditemukan"
				description={`Tidak ada program studi dengan ID "${programId}". Mungkin sudah dihapus.`}
				links={[
					{ label: 'Kembali ke Program Studi', to: '/dashboard/study-programs' },
				]}
			/>
		);
	}

	if (!program) {
		return <div className="p-8 text-center text-muted-foreground">Memuat data program studi...</div>;
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
						Edit program studi
					</h2>
				</div>
			</div>

			{/* Lihat catatan di create-study-program.tsx soal CardHeader yang ini. */}
			<Card>
				<CardHeader>
					<CardDescription>
						Nomor SK dan masa berlaku boleh kosong kalau program studi ini
						belum terakreditasi.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						{formError && (
							<p className="text-sm text-destructive">{formError}</p>
						)}
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
