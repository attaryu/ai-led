import * as React from 'react';
import { ApiError } from '~/core/lib/api-client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import {
	createAccreditationSetSchema,
	type CreateAccreditationSetDto,
} from '../../domain/dtos/create-accreditation-set.dto';
import { accreditationSetRepository } from '../../data/repositories/accreditation-set.repository';
import { AccreditationSetFormFields } from '../components/accreditation-set-form-fields';
import { useAccreditationSetPermission } from '../hooks/use-accreditation-set-permission';

export function CreateAccreditationSet() {
	const navigate = useNavigate();
	const { canManage } = useAccreditationSetPermission();
	const [formError, setFormError] = React.useState<string | null>(null);

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<CreateAccreditationSetDto>({
		resolver: zodResolver(createAccreditationSetSchema),
		defaultValues: {
			nama: '',
			lembaga: '',
			tahunSiklus: new Date().getFullYear(),
		},
	});

	const onSubmit = async (data: CreateAccreditationSetDto) => {
		setFormError(null);

		try {
			const created = await accreditationSetRepository.create(data);
			// Langsung ke detailnya: set baru selalu lahir kosong, dan yang
			// dituju pengguna sesudah membuatnya pasti mengunggah berkas.
			navigate(`/dashboard/accreditation-sets/${created.id}`);
		} catch (e) {
			setFormError(e instanceof ApiError ? e.message : 'Gagal menyimpan set akreditasi.');
		}
	};

	if (!canManage) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Hanya Penjamin Mutu yang dapat menambah set akreditasi.
			</div>
		);
	}

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<div className="flex items-center gap-4">
				<Button
					variant="outline"
					size="icon"
					onClick={() => navigate('/dashboard/accreditation-sets')}
					className="cursor-pointer"
				>
					<ArrowLeftIcon className="size-4" />
				</Button>
				<div>
					<h2 className="font-heading text-2xl font-bold tracking-tight">
						Tambah Set Akreditasi
					</h2>
					<p className="text-sm text-muted-foreground">
						Berkas acuannya diunggah setelah set ini dibuat.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Identitas Set</CardTitle>
					<CardDescription>
						Set menandai satu lembaga penilai untuk satu siklus akreditasi.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						{formError && (
							<p className="text-sm text-destructive">{formError}</p>
						)}

						<AccreditationSetFormFields
							register={register}
							errors={errors}
							disabled={isSubmitting}
						/>

						<div className="flex justify-end gap-2 border-t border-border pt-4">
							<Button
								type="button"
								variant="outline"
								className="cursor-pointer"
								onClick={() => navigate('/dashboard/accreditation-sets')}
							>
								Batal
							</Button>
							<Button
								type="submit"
								disabled={isSubmitting}
								className="cursor-pointer"
							>
								{isSubmitting ? 'Menyimpan...' : 'Simpan & Unggah Berkas'}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
