import * as React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, TrashIcon } from '@phosphor-icons/react';

import { Button } from '~/core/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/core/components/ui/dialog';
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from '~/core/components/ui/field';
import { Input } from '~/core/components/ui/input';
import { Select } from '~/core/components/ui/select';
import { Textarea } from '~/core/components/ui/textarea';
import { cn } from '~/core/lib/utils';
import { CHAPTER_TEMPLATE } from '~/features/chapter/data/repositories/chapter.repository';
import {
	rubricScoreTypeLabels,
	type RubricCriterion,
	type RubricScoreType,
} from '~/features/chapter/domain/entities/rubric-criterion.entity';
import { type CriterionInput } from '../../data/repositories/accreditation-set.repository';
import {
	parseTabelLkps,
	rubricCriterionFormSchema,
	type RubricCriterionFormDto,
} from '../../domain/dtos/rubric-criterion-form.dto';

function toFormValues(kriteria: RubricCriterion): RubricCriterionFormDto {
	return {
		no: kriteria.no,
		kodeKriteria: kriteria.kodeKriteria,
		kriteria: kriteria.kriteria,
		deskripsi: kriteria.deskripsi,
		tipeSkor: kriteria.tipeSkor,
		tabelLkps: kriteria.tabelLkps.join(', '),
		urutanBab: kriteria.urutanBab,
		levelSkor: kriteria.levelSkor,
	};
}

/**
 * Formulir koreksi satu kriteria rubrik.
 *
 * **Hanya mengoreksi, tidak pernah membuat.** Isi rubrik turun dari lembaga
 * penilai lewat berkas yang diunggah, bukan dikarang di dalam aplikasi — jadi
 * yang dibutuhkan orang di sini adalah membetulkan baris yang salah terbaca,
 * bukan menyusun indikator sendiri. Formulir yang bisa membuat kriteria dari nol
 * akan menyatakan hal yang keliru tentang dari mana acuan penilaian berasal.
 *
 * Selalu dipasang bersama kriteria yang sedang dikoreksi, dan dilepas kembali
 * saat tidak ada — karena itu `initial` tidak pernah `null`.
 */
export function CriterionFormDialog({
	open,
	onOpenChange,
	initial,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initial: RubricCriterion;
	/** Melempar bila ditolak repository (mis. nomor indikator kembar). */
	onSubmit: (input: CriterionInput) => Promise<void>;
}) {
	const [formError, setFormError] = React.useState<string | null>(null);

	const {
		register,
		handleSubmit,
		reset,
		watch,
		setValue,
		control,
		formState: { errors, isSubmitting },
	} = useForm<RubricCriterionFormDto>({
		resolver: zodResolver(rubricCriterionFormSchema),
		defaultValues: toFormValues(initial),
	});

	const { fields, append, remove } = useFieldArray({
		control,
		name: 'levelSkor',
	});

	// Nilai awal dipasang saat dialog dibuka, bukan setiap kali `initial`
	// berubah: menutup dialog tidak mengosongkan `initial`, dan mengisi ulang di
	// luar pembukaan akan membuang ketikan yang belum sempat disimpan.
	React.useEffect(() => {
		if (open) {
			reset(toFormValues(initial));
			setFormError(null);
		}
	}, [open, initial, reset]);

	const babTerpilih = watch('urutanBab') ?? [];

	const toggleBab = (urutan: number) => {
		const sudahAda = babTerpilih.includes(urutan);

		setValue(
			'urutanBab',
			sudahAda
				? babTerpilih.filter((n) => n !== urutan)
				: [...babTerpilih, urutan],
			{ shouldValidate: true, shouldDirty: true },
		);
	};

	const simpan = async (data: RubricCriterionFormDto) => {
		setFormError(null);

		try {
			await onSubmit({
				no: data.no,
				kodeKriteria: data.kodeKriteria.trim(),
				kriteria: data.kriteria.trim(),
				deskripsi: data.deskripsi.trim(),
				tipeSkor: data.tipeSkor as RubricScoreType,
				tabelLkps: parseTabelLkps(data.tabelLkps),
				urutanBab: [...data.urutanBab].sort((a, b) => a - b),
				// Diurutkan sebelum disimpan supaya setiap tempat yang membacanya
				// tidak perlu mengurutkannya lagi sendiri.
				levelSkor: [...data.levelSkor].sort((a, b) => a.skor - b.skor),
			});
			onOpenChange(false);
		} catch (e) {
			setFormError(e instanceof Error ? e.message : 'Gagal menyimpan kriteria.');
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Koreksi Kriteria</DialogTitle>
					<DialogDescription>
						Membetulkan indikator nomor {initial.no} beserta level skor dan bab
						yang dinilainya.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit(simpan)} className="space-y-5">
					{formError && (
						<p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{formError}
						</p>
					)}

					<FieldGroup>
						<div className="grid gap-4 sm:grid-cols-3">
							<Field data-invalid={!!errors.no}>
								<FieldLabel htmlFor="no">Nomor Indikator</FieldLabel>
								<Input
									id="no"
									type="number"
									placeholder="1"
									{...register('no', { valueAsNumber: true })}
								/>
								{errors.no && <FieldError>{errors.no.message}</FieldError>}
							</Field>

							<Field data-invalid={!!errors.kodeKriteria}>
								<FieldLabel htmlFor="kodeKriteria">Kode</FieldLabel>
								<Input
									id="kodeKriteria"
									placeholder="C1"
									{...register('kodeKriteria')}
								/>
								{errors.kodeKriteria && (
									<FieldError>{errors.kodeKriteria.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!errors.tipeSkor}>
								<FieldLabel htmlFor="tipeSkor">Tipe Skor</FieldLabel>
								<Select id="tipeSkor" {...register('tipeSkor')}>
									{(Object.keys(rubricScoreTypeLabels) as RubricScoreType[]).map(
										(tipe) => (
											<option key={tipe} value={tipe}>
												{rubricScoreTypeLabels[tipe]}
											</option>
										),
									)}
								</Select>
								{errors.tipeSkor && (
									<FieldError>{errors.tipeSkor.message}</FieldError>
								)}
							</Field>
						</div>

						<Field data-invalid={!!errors.kriteria}>
							<FieldLabel htmlFor="kriteria">Kelompok Kriteria</FieldLabel>
							<Input
								id="kriteria"
								placeholder="Visi, Misi, Tujuan, dan Strategi"
								{...register('kriteria')}
							/>
							<FieldDescription>
								Nama kelompok yang memayungi indikator ini. Beberapa indikator
								boleh berbagi kelompok yang sama.
							</FieldDescription>
							{errors.kriteria && (
								<FieldError>{errors.kriteria.message}</FieldError>
							)}
						</Field>

						<Field data-invalid={!!errors.deskripsi}>
							<FieldLabel htmlFor="deskripsi">Bunyi Kriteria</FieldLabel>
							<Textarea
								id="deskripsi"
								rows={3}
								placeholder="Apa yang dinilai indikator ini?"
								{...register('deskripsi')}
							/>
							{errors.deskripsi && (
								<FieldError>{errors.deskripsi.message}</FieldError>
							)}
						</Field>

						<Field data-invalid={!!errors.tabelLkps}>
							<FieldLabel htmlFor="tabelLkps">Tabel LKPS</FieldLabel>
							<Input
								id="tabelLkps"
								placeholder="Tabel 3.a.1, Tabel 3.a.2"
								{...register('tabelLkps')}
							/>
							<FieldDescription>
								Dipisah koma. Kosongkan bila indikator ini dinilai sepenuhnya
								dari narasi LED — kosongnya bermakna, bukan sekadar belum diisi.
							</FieldDescription>
						</Field>

						<Field data-invalid={!!errors.urutanBab}>
							<FieldLabel>Bab yang Dinilai</FieldLabel>
							<div className="flex flex-wrap gap-1.5">
								{CHAPTER_TEMPLATE.map((bab) => {
									const aktif = babTerpilih.includes(bab.chapterOrder);

									return (
										<button
											key={bab.chapterOrder}
											type="button"
											onClick={() => toggleBab(bab.chapterOrder)}
											aria-pressed={aktif}
											title={`Bab ${bab.chapterOrder} — ${bab.chapterTitle}`}
											className={cn(
												'inline-flex size-9 cursor-pointer items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors',
												aktif
													? 'border-primary bg-primary text-primary-foreground'
													: 'border-input bg-background hover:bg-accent',
											)}
										>
											{bab.chapterOrder}
										</button>
									);
								})}
							</div>
							<FieldDescription>
								Arahkan penunjuk ke nomornya untuk melihat judul bab.
							</FieldDescription>
							{errors.urutanBab && (
								<FieldError>{errors.urutanBab.message as string}</FieldError>
							)}
						</Field>
					</FieldGroup>

					<div className="space-y-3 border-t border-border pt-4">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<p className="text-sm font-medium">Level Skor</p>
								<p className="text-xs text-muted-foreground">
									Apa yang harus dipenuhi isi bab untuk mendapat tiap skor.
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="cursor-pointer gap-1.5"
								onClick={() => append({ skor: fields.length, deskripsi: '' })}
							>
								<PlusIcon className="size-4" />
								Level
							</Button>
						</div>

						{errors.levelSkor?.message && (
							<FieldError>{errors.levelSkor.message as string}</FieldError>
						)}

						<div className="flex flex-col gap-2">
							{fields.map((field, index) => (
								<div
									key={field.id}
									className="flex flex-col gap-2 rounded-md border border-border p-2 sm:flex-row sm:items-start"
								>
									<div className="sm:w-20">
										<Input
											type="number"
											aria-label={`Skor level ke-${index + 1}`}
											{...register(`levelSkor.${index}.skor`, {
												valueAsNumber: true,
											})}
										/>
										{errors.levelSkor?.[index]?.skor && (
											<FieldError>
												{errors.levelSkor[index]?.skor?.message}
											</FieldError>
										)}
									</div>
									<div className="min-w-0 flex-1">
										<Textarea
											rows={2}
											aria-label={`Bunyi level ke-${index + 1}`}
											placeholder="Bunyi level ini"
											{...register(`levelSkor.${index}.deskripsi`)}
										/>
										{errors.levelSkor?.[index]?.deskripsi && (
											<FieldError>
												{errors.levelSkor[index]?.deskripsi?.message}
											</FieldError>
										)}
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										title="Hapus level"
										className="cursor-pointer text-destructive hover:text-destructive"
										onClick={() => remove(index)}
									>
										<TrashIcon className="size-4" />
									</Button>
								</div>
							))}
						</div>
					</div>

					<DialogFooter className="gap-2 border-t border-border pt-4">
						<Button
							type="button"
							variant="outline"
							className="cursor-pointer"
							onClick={() => onOpenChange(false)}
						>
							Batal
						</Button>
						<Button
							type="submit"
							disabled={isSubmitting}
							className="cursor-pointer"
						>
							{isSubmitting ? 'Menyimpan...' : 'Simpan Kriteria'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
