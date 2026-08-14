import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import {
	updateUserSchema,
	type UpdateUserDto,
} from '../../domain/dtos/update-user.dto';
import {
	userRoleEnum,
	type UserEntity,
} from '../../domain/entities/user.entity';
import { userRepository } from '../../data/repositories/user.repository';
import type { StudyProgramEntity } from '../../../study-program/domain/entities/study-program.entity';
import { studyProgramRepository } from '../../../study-program/data/repositories/study-program.repository';

export function EditUser() {
	const navigate = useNavigate();
	const { userId } = useParams<{ userId: string }>();
	const [studyPrograms, setStudyPrograms] = React.useState<StudyProgramEntity[]>([]);
	const [user, setUser] = React.useState<UserEntity | null>(null);

	React.useEffect(() => {
		studyProgramRepository.findAll().then(setStudyPrograms);
		if (userId) {
			const found = userRepository.findById(userId);
			if (found) {
				setUser(found);
			} else {
				alert('User tidak ditemukan!');
				navigate('/dashboard/users');
			}
		}
	}, [userId, navigate]);

	const {
		register,
		handleSubmit,
		control,
		setValue,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<UpdateUserDto>({
		resolver: zodResolver(updateUserSchema),
		defaultValues: {
			namaLengkap: '',
			email: '',
			role: 'Penjamin Mutu',
			studyProgramId: '',
			showPasswordChange: false,
			password: '',
		},
	});

	// Populate form fields once user is loaded
	React.useEffect(() => {
		if (user) {
			reset({
				namaLengkap: user.namaLengkap,
				email: user.email,
				role: user.role,
				studyProgramId: user.studyProgramId || '',
				showPasswordChange: false,
				password: '',
			});
		}
	}, [user, reset]);

	const selectedRole = useWatch({
		control,
		name: 'role',
	});

	const showPasswordChange = useWatch({
		control,
		name: 'showPasswordChange',
	});

	React.useEffect(() => {
		if (selectedRole !== 'Penyusun') {
			setValue('studyProgramId', null);
		} else if (studyPrograms.length > 0 && !user?.studyProgramId) {
			setValue('studyProgramId', studyPrograms[0].id);
		}
	}, [selectedRole, studyPrograms, setValue, user]);

	const onSubmit = (data: UpdateUserDto) => {
		if (!userId) return;

		const selectedProgramObj =
			data.role === 'Penyusun' && data.studyProgramId
				? studyPrograms.find((p) => p.id === data.studyProgramId)
				: null;

		const updatedFields: Partial<UserEntity> = {
			namaLengkap: data.namaLengkap,
			email: data.email,
			role: data.role,
			studyProgramId: data.role === 'Penyusun' ? data.studyProgramId : null,
			studyProgramName: selectedProgramObj
				? selectedProgramObj.studyProgramName
				: null,
		};

		userRepository.update(userId, updatedFields);
		navigate('/dashboard/users');
	};

	if (!user) {
		return <div className="p-8 text-center text-muted-foreground">Memuat data user...</div>;
	}

	return (
		<div className="flex flex-col gap-6 max-w-2xl mx-auto">
			<div className="flex items-center gap-4">
				<Button
					variant="outline"
					size="icon"
					onClick={() => navigate('/dashboard/users')}
					className="cursor-pointer"
				>
					<ArrowLeftIcon className="size-4" />
				</Button>
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Edit Pengguna
					</h2>
					<p className="text-sm text-muted-foreground">
						Ubah data lengkap pengguna di bawah ini.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Formulir Pengguna</CardTitle>
					<CardDescription>
						Seluruh kolom wajib diisi sesuai dengan data pengguna.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

							<div className="flex items-center gap-2 py-2">
								<input
									type="checkbox"
									id="showPasswordChange"
									className="rounded border-gray-300 text-primary focus:ring-primary size-4 cursor-pointer"
									disabled={isSubmitting}
									{...register('showPasswordChange')}
								/>
								<label htmlFor="showPasswordChange" className="text-sm font-medium cursor-pointer">
									Ubah Password
								</label>
							</div>

							{showPasswordChange && (
								<Field data-invalid={!!errors.password}>
									<FieldLabel htmlFor="password">Password Baru</FieldLabel>
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
							)}

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

							{selectedRole === 'Penyusun' && (
								<Field data-invalid={!!errors.studyProgramId}>
									<FieldLabel htmlFor="studyProgramId">
										Program Studi
									</FieldLabel>
									{studyPrograms.length === 0 ? (
										<div className="text-sm text-destructive py-1.5 px-3 bg-destructive/10 border border-destructive/20 rounded-md">
											Belum ada data Prodi. Silakan buat Prodi terlebih dahulu
											di menu Manajemen Prodi.
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
								className="cursor-pointer"
							>
								{isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
