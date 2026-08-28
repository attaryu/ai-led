import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router';
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
	updateAccreditationSetSchema,
	type UpdateAccreditationSetDto,
} from '../../domain/dtos/update-accreditation-set.dto';
import {
	SET_DOCUMENT_TYPES,
	deriveSetCompleteness,
	findSetDocument,
	type AccreditationSetEntity,
	type SetDocumentType,
} from '../../domain/entities/accreditation-set.entity';
import { accreditationSetRepository } from '../../data/repositories/accreditation-set.repository';
import { AccreditationSetFormFields } from '../components/accreditation-set-form-fields';
import { DocumentSlotCard } from '../components/document-slot-card';
import { SetStatusBadge } from '../components/set-status-badge';
import { useAccreditationSetPermission } from '../hooks/use-accreditation-set-permission';

export function AccreditationSetDetail() {
	const navigate = useNavigate();
	const { setId } = useParams<{ setId: string }>();
	const { canView, canManage, session } = useAccreditationSetPermission();
	const [set, setSet] = React.useState<AccreditationSetEntity | null>(null);
	const [notFound, setNotFound] = React.useState(false);
	const [formError, setFormError] = React.useState<string | null>(null);

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting, isDirty },
	} = useForm<UpdateAccreditationSetDto>({
		resolver: zodResolver(updateAccreditationSetSchema),
		defaultValues: { nama: '', lembaga: '', tahunSiklus: new Date().getFullYear() },
	});

	const loadData = React.useCallback(() => {
		if (!setId) return;

		accreditationSetRepository.findById(setId).then((found) => {
			if (!found) {
				setNotFound(true);
				return;
			}
			setSet(found);
		});
	}, [setId]);

	React.useEffect(() => {
		loadData();
	}, [loadData]);

	// Formulir diisi ulang hanya saat identitas setnya berubah, bukan tiap kali
	// daftar berkas berubah — mengunggah berkas tidak boleh membuang isian yang
	// belum sempat disimpan.
	React.useEffect(() => {
		if (set) {
			reset({
				nama: set.nama,
				lembaga: set.lembaga,
				tahunSiklus: set.tahunSiklus,
			});
		}
	}, [set?.id, set?.nama, set?.lembaga, set?.tahunSiklus, reset]);

	const onSubmit = async (data: UpdateAccreditationSetDto) => {
		if (!setId) return;
		setFormError(null);

		try {
			setSet(await accreditationSetRepository.update(setId, data));
		} catch {
			setFormError('Gagal menyimpan perubahan.');
		}
	};

	const handleUpload = React.useCallback(
		async (tipe: SetDocumentType, file: File) => {
			if (!setId) return;
			setSet(
				await accreditationSetRepository.attachDocument(
					setId,
					tipe,
					file,
					session?.namaLengkap ?? 'Tidak diketahui',
				),
			);
		},
		[setId, session?.namaLengkap],
	);

	const handleRemove = React.useCallback(
		async (tipe: SetDocumentType) => {
			if (!setId) return;
			if (!confirm('Hapus berkas pada slot ini?')) return;
			setSet(await accreditationSetRepository.removeDocument(setId, tipe));
		},
		[setId],
	);

	// Alasan sama dengan halaman daftarnya: lapis tenant meloloskan Admin, jadi
	// alamat ini masih terbuka langsung walau menunya tidak ada.
	if (!canView) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Set akreditasi adalah bagian dari konten akreditasi, di luar kewenangan
				Admin.
			</div>
		);
	}

	if (notFound) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Set akreditasi tidak ditemukan.
			</div>
		);
	}

	if (!set) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Memuat set akreditasi...
			</div>
		);
	}

	const { lengkap, kosong } = deriveSetCompleteness(set);

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-6">
			<div className="flex items-center gap-4">
				<Button
					variant="outline"
					size="icon"
					onClick={() => navigate('/dashboard/accreditation-sets')}
					className="cursor-pointer"
				>
					<ArrowLeftIcon className="size-4" />
				</Button>
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="font-heading text-2xl font-bold tracking-tight">
							{set.nama}
						</h2>
						<SetStatusBadge status={set.status} />
					</div>
					<p className="text-sm text-muted-foreground">
						{set.lembaga} · siklus {set.tahunSiklus}
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Identitas Set</CardTitle>
					<CardDescription>
						{canManage
							? 'Menandai lembaga penilai dan siklus akreditasi set ini.'
							: 'Hanya Penjamin Mutu yang dapat mengubah identitas set.'}
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
							disabled={!canManage || isSubmitting}
						/>

						{canManage && (
							<div className="flex justify-end border-t border-border pt-4">
								<Button
									type="submit"
									disabled={isSubmitting || !isDirty}
									className="cursor-pointer"
								>
									{isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
								</Button>
							</div>
						)}
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Berkas Acuan</CardTitle>
					<CardDescription>
						{lengkap
							? 'Ketiga berkas acuan sudah lengkap.'
							: `Masih ada ${kosong.length} berkas yang belum diunggah.`}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{SET_DOCUMENT_TYPES.map((tipe) => (
						<DocumentSlotCard
							key={tipe}
							tipe={tipe}
							dokumen={findSetDocument(set, tipe)}
							canManage={canManage}
							onUpload={handleUpload}
							onRemove={handleRemove}
						/>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
