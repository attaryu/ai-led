import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react';

import { ApiError } from '~/core/lib/api-client';
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
import {
	createUserSchema,
	type CreateUserDto,
} from '../../domain/dtos/create-user.dto';
import { userRoleEnum } from '../../domain/entities/user.entity';
import { userRepository } from '../../data/repositories/user.repository';
import type { StudyProgramEntity } from '../../../study-program/domain/entities/study-program.entity';
import { studyProgramRepository } from '../../../study-program/data/repositories/study-program.repository';

export function CreateUser() {
	const navigate = useNavigate();
	const [studyPrograms, setStudyPrograms] = React.useState<
		StudyProgramEntity[]
	>([]);
	const [formError, setFormError] = React.useState<string | null>(null);

	React.useEffect(() => {
		studyProgramRepository.findAll().then(setStudyPrograms);
	}, []);

	const {
		register,
		handleSubmit,
		control,
		setValue,
		formState: { errors, isSubmitting },
	} = useForm<CreateUserDto>({
		resolver: zodResolver(createUserSchema),
		defaultValues: {
			namaLengkap: '',
			email: '',
			password: '',
			role: 'Penjamin Mutu',
			studyProgramId: '',
		},
	});

	const selectedRole = useWatch({
		control,
		name: 'role',
	});

	React.useEffect(() => {
		if (selectedRole !== 'Penyusun') {
			setValue('studyProgramId', null);
		} else if (studyPrograms.length > 0) {
			setValue('studyProgramId', studyPrograms[0].id);
		}
	}, [selectedRole, studyPrograms, setValue]);

	const onSubmit = async (data: CreateUserDto) => {
		setFormError(null);
		try {
			await userRepository.create({
				namaLengkap: data.namaLengkap,
				email: data.email,
				password: data.password,
				role: data.role,
				studyProgramId: data.role === 'Penyusun' ? (data.studyProgramId ?? null) : null,
			});
			navigate('/dashboard/users');
		} catch (e) {
			setFormError(e instanceof ApiError ? e.message : 'Gagal menyimpan pengguna.');
		}
	};

	return (
		<div className="flex flex-col gap-6 max-w-2xl mx-auto">
			<div className="flex items-center gap-4">
				<Button
					variant="outline"
					size="icon"
					onClick={() => navigate('/dashboard/users')}
				>
					<ArrowLeftIcon className="size-4" />
				</Button>
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Tambah pengguna
					</h2>
				</div>
			</div>

			{/*
			 * Tanpa CardHeader: judul halaman di atasnya sudah menyebut apa yang
			 * sedang dikerjakan, dan kolom wajib sudah ditandai formulirnya sendiri.
			 */}
			<Card>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						{formError && (
							<p className="text-sm text-destructive">{formError}</p>
						)}
						<FieldGroup>
							<Field data-invalid={!!errors.namaLengkap}>
								<FieldLabel htmlFor="namaLengkap">Nama Lengkap</FieldLabel>
								<Input
									id="namaLengkap"
									placeholder="Contoh: John Doe"
									disabled={isSubmitting}
									{...register('namaLengkap')}
								/>
								{errors.namaLengkap && (
									<FieldError>{errors.namaLengkap.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!errors.email}>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									type="email"
									placeholder="johndoe@univ.ac.id"
									disabled={isSubmitting}
									{...register('email')}
								/>
								{errors.email && (
									<FieldError>{errors.email.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!errors.password}>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									type="password"
									placeholder="••••••"
									disabled={isSubmitting}
									{...register('password')}
								/>
								{errors.password && (
									<FieldError>{errors.password.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!errors.role}>
								<FieldLabel htmlFor="role">Role</FieldLabel>
								<Select id="role" disabled={isSubmitting} {...register('role')}>
									{userRoleEnum.options.map((role) => (
										<option key={role} value={role}>
											{role}
										</option>
									))}
								</Select>
								{errors.role && <FieldError>{errors.role.message}</FieldError>}
							</Field>

							{/* Conditional Study Program select dropdown */}
							{selectedRole === 'Penyusun' && (
								<Field data-invalid={!!errors.studyProgramId}>
									<FieldLabel htmlFor="studyProgramId">
										Program Studi
									</FieldLabel>
									{studyPrograms.length === 0 ? (
										<div className="text-sm text-destructive py-1.5 px-3 bg-destructive/10 border border-destructive/20 rounded-md">
											Belum ada program studi. Buat satu dulu lewat menu
											Program Studi.
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
							)}
						</FieldGroup>

						<div className="pt-4 border-t border-border flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => navigate('/dashboard/users')}
							>
								Batal
							</Button>
							<Button
								type="submit"
								disabled={
									isSubmitting ||
									(selectedRole === 'Penyusun' && studyPrograms.length === 0)
								}
							>
								{isSubmitting ? 'Menyimpan...' : 'Simpan'}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
