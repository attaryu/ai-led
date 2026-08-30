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
import { Card, CardContent } from '~/core/components/ui/card';
import { fromDateInputValue } from '~/core/lib/format-time';
import { safeReturnTo } from '~/core/lib/utils';
import {
	createLedProjectSchema,
	type CreateLedProjectDto,
} from '../../domain/dtos/create-led-project.dto';
import {
	adaTahunAkademikGanda,
	type LedProjectEntity,
	susunTahunAkademik,
} from '../../domain/entities/led-project.entity';
import { TahunAkademikField } from '../components/tahun-akademik-field';
import { ledProjectRepository } from '../../data/repositories/led-project.repository';
import { type StudyProgramEntity } from '../../../study-program/domain/entities/study-program.entity';
import { studyProgramRepository } from '../../../study-program/data/repositories/study-program.repository';
import { accreditationSetRepository } from '~/features/accreditation-set/data/repositories/accreditation-set.repository';
import { type AccreditationSetEntity } from '~/features/accreditation-set/domain/entities/accreditation-set.entity';

export function CreateLedProject() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [studyPrograms, setStudyPrograms] = React.useState<StudyProgramEntity[]>([]);
	const [acuanTersedia, setAcuanTersedia] = React.useState<
		AccreditationSetEntity[]
	>([]);

	/*
	 * Formulir ini bisa dibuka dari dua tempat: daftar lintas program studi di lapis
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
		setStudyPrograms(studyProgramRepository.findAll());
		accreditationSetRepository.findSelectable().then(setAcuanTersedia);
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
			// Dokumen LED nyaris selalu disusun untuk tahun akademik yang sedang
			// berjalan, jadi tahun sekarang adalah tebakan yang hampir selalu benar
			// — dan kolomnya langsung memperlihatkan tahun akhirnya tanpa diketik.
			tahunMulai: String(new Date().getFullYear()),
			tenggat: '',
			accreditationSetId: '',
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

	// Satu siklus umumnya hanya punya satu acuan yang berlaku, jadi pilihan
	// pertama nyaris selalu jawaban yang benar dan kolomnya tinggal dilewati.
	React.useEffect(() => {
		if (acuanTersedia.length > 0) {
			setValue('accreditationSetId', acuanTersedia[0].id);
		}
	}, [acuanTersedia, setValue]);

	const onSubmit = (data: CreateLedProjectDto) => {
		const prodi = studyPrograms.find((p) => p.id === data.studyProgramId);
		if (!prodi) {
			alert('Program studi tidak valid.');
			return;
		}

		const tahunAkademik = susunTahunAkademik(Number(data.tahunMulai));

		/*
		 * Ditegakkan di sini, bukan di repository, supaya pesannya menempel ke
		 * kolom tahun alih-alih muncul sebagai `alert` lepas. Lihat alasan
		 * kenapa duplikat berbahaya di `adaTahunAkademikGanda`.
		 */
		if (
			adaTahunAkademikGanda(ledProjectRepository.findAll(), {
				studyProgramId: data.studyProgramId,
				tahunAkademik,
			})
		) {
			setError('tahunMulai', {
				message: `${prodi.studyProgramName} sudah punya Dokumen LED untuk tahun akademik ${tahunAkademik}`,
			});
			return;
		}

		const newProject: LedProjectEntity = {
			id: Date.now().toString(),
			studyProgramId: data.studyProgramId,
			studyProgramName: prodi.studyProgramName,
			judul: data.judul,
			tahunAkademik,
			statusKeseluruhan: 'DRAFT',
			tenggat: fromDateInputValue(data.tenggat),
			accreditationSetId: data.accreditationSetId,
			createdAt: new Date().toISOString(),
		};

		// Lewat repository, bukan localStorage langsung: di sanalah struktur bab
		// standar ikut dibuat untuk dokumen baru ini (§7.3).
		ledProjectRepository.create(newProject);
		navigate(returnTo);
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
						Tambah Dokumen LED
					</h2>
				</div>
			</div>

			{/*
			 * Tanpa CardHeader: judul halaman di atasnya sudah menyebut apa yang
			 * sedang dikerjakan, dan "Formulir Dokumen LED" cuma mengulanginya satu
			 * baris di bawahnya.
			 */}
			<Card>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<FieldGroup>
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

							<Field data-invalid={!!errors.accreditationSetId}>
								<FieldLabel htmlFor="accreditationSetId">
									Acuan Penilaian
								</FieldLabel>
								{acuanTersedia.length === 0 ? (
									// Menolak dengan alasan, bukan kolom kosong yang diam.
									// Lembaga penilai menerbitkan panduan, template, dan rubrik
									// sekaligus, jadi acuannya memang mestinya sudah ada sebelum
									// penyusunan dibuka — kalau belum ada, yang kurang bukan
									// isian formulir ini, melainkan setnya sendiri.
									<div className="text-sm text-destructive border border-destructive/20 bg-destructive/10 rounded-md p-3">
										Belum ada set akreditasi yang siap dipakai. Lengkapi berkas
										dan isi rubriknya lebih dulu di menu Set Akreditasi.
									</div>
								) : (
									<Select
										id="accreditationSetId"
										disabled={isSubmitting}
										{...register('accreditationSetId')}
									>
										{acuanTersedia.map((set) => (
											<option key={set.id} value={set.id}>
												{set.nama} — {set.lembaga} · siklus {set.tahunSiklus}
											</option>
										))}
									</Select>
								)}
								{errors.accreditationSetId && (
									<FieldError>{errors.accreditationSetId.message}</FieldError>
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
